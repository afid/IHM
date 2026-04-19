/**
 * situations-manager.js
 *
 * GESTIONNAIRE DES SITUATIONS :
 * Ce fichier gère toutes les opérations CRUD (Create, Read, Update, Delete)
 * pour les situations stockées dans DynamoDB (Core_Ddb_IHM).
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_IHM';

    // DOM Elements - List
    const tableBody = document.getElementById('situations-table-body');
    const newSituationBtn = document.getElementById('new-situation-btn');

    // DOM Elements - Modal
    const editorModal = document.getElementById('situation-editor-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const saveSituationBtn = document.getElementById('save-situation-btn');

    const situationNameInput = document.getElementById('situation-name');
    const situationPriorityInput = document.getElementById('situation-priority');

    // DOM Elements - Confirmation
    const confirmModal = document.getElementById('confirmation-modal');
    const confirmBackdrop = document.getElementById('confirmation-backdrop');
    const confirmMessage = document.getElementById('confirm-message');
    const okConfirmBtn = document.getElementById('ok-confirm-btn');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const closeConfirmBtn = document.getElementById('close-confirm-btn');

    // State
    let allSituations = [];
    let currentId = null;
    let isEditMode = false;
    let confirmCallback = null;

    /**
     * Initialisation
     */
    async function init() {
        await loadSituations();
        setupEventListeners();
    }

    /**
     * Charge les situations depuis DynamoDB
     */
    async function loadSituations() {
        try {
            tableBody.innerHTML = '<tr><td colspan="3" class="slds-text-align_center slds-p-around_medium">Chargement...</td></tr>';
            const items = await window.dynamoDBService.scan(TABLE_NAME);
            allSituations = (items || []).filter(item => item.Type === 'Situation');

            // Trier par ID
            allSituations.sort((a, b) => (parseInt(a.Id) || 0) - (parseInt(b.Id) || 0));

            renderTable();
        } catch (err) {
            console.error('Erreur chargement situations:', err);
            tableBody.innerHTML = '<tr><td colspan="3" class="slds-text-align_center slds-text-color_error slds-p-around_medium">Erreur lors du chargement.</td></tr>';
        }
    }

    /**
     * Affiche le tableau
     */
    function renderTable() {
        if (allSituations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="slds-text-align_center slds-p-around_medium">Aucune situation trouvée. Utilisez « Nouvelle Situation » pour en créer.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        allSituations.forEach(sit => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="slds-text-title_bold">${sit.Name || ''}</td>
                <td>${sit.Priority || 0}</td>
                <td class="slds-text-align_right">
                    <div class="slds-button-group" role="group">
                        <button class="slds-button slds-button_icon slds-button_icon-border edit-btn" title="Éditer">✏️</button>
                        <button class="slds-button slds-button_icon slds-button_icon-border duplicate-btn" title="Dupliquer">📋</button>
                        <button class="slds-button slds-button_icon slds-button_icon-border slds-button_icon-error delete-btn" title="Supprimer">🗑️</button>
                    </div>
                </td>
            `;

            tr.querySelector('.edit-btn').addEventListener('click', () => openModal(sit, 'edit'));
            tr.querySelector('.duplicate-btn').addEventListener('click', () => openModal(sit, 'duplicate'));
            tr.querySelector('.delete-btn').addEventListener('click', () => deleteSituation(sit));

            tableBody.appendChild(tr);
        });
    }

    /**
     * Ouvre le modal
     */
    function openModal(sit = null, mode = 'create') {
        isEditMode = (mode === 'edit');
        currentId = (sit && isEditMode) ? sit.Id : null;
        modalTitle.textContent = isEditMode ? `Modifier Situation ${sit.Name}` : (mode === 'duplicate' ? 'Dupliquer Situation' : 'Nouvelle Situation');

        // Populate
        situationNameInput.value = sit ? (sit.Name + (mode === 'duplicate' ? '_COPY' : '')) : '';
        situationPriorityInput.value = sit ? sit.Priority : '';

        editorModal.classList.add('slds-fade-in-open');
        modalBackdrop.classList.add('slds-backdrop_open');
    }

    function closeModal() {
        editorModal.classList.remove('slds-fade-in-open');
        modalBackdrop.classList.remove('slds-backdrop_open');
    }


    /**
     * Sauvegarde
     */
    async function saveSituation() {
        const name = situationNameInput.value.trim();
        const priority = parseInt(situationPriorityInput.value);

        if (!name || isNaN(priority)) {
            showToast("Veuillez remplir tous les champs obligatoires.", "error");
            return;
        }

        try {
            saveSituationBtn.disabled = true;
            saveSituationBtn.textContent = 'Sauvegarde...';

            let idToSave = currentId;
            if (!isEditMode) {
                // Calculation for new ID
                const maxId = allSituations.reduce((max, sit) => Math.max(max, parseInt(sit.Id) || 0), 0);
                idToSave = maxId + 1;
            }

            const data = {
                Id: idToSave,
                Type: 'Situation',
                Name: name,
                Priority: priority,
                UpdatedAt: new Date().toISOString()
            };

            await window.dynamoDBService.put(TABLE_NAME, data);
            showToast("Situation sauvegardée avec succès.", "success");
            closeModal();
            await loadSituations();
        } catch (err) {
            console.error('Erreur sauvegarde:', err);
        } finally {
            saveSituationBtn.disabled = false;
            saveSituationBtn.textContent = 'Sauvegarder';
        }
    }

    /**
     * Suppression
     */
    function deleteSituation(sit) {
        confirmMessage.textContent = `Êtes-vous sûr de vouloir supprimer la situation "${sit.Name}" (ID: ${sit.Id}) ?`;
        confirmCallback = async () => {
            try {
                await window.dynamoDBService.delete(TABLE_NAME, { Id: sit.Id });
                showToast("Situation supprimée.", "success");
                await loadSituations();
            } catch (err) {
                console.error('Erreur suppression:', err);
            }
        };
        openConfirmModal();
    }

    /**
     * Event Listeners
     */
    function setupEventListeners() {
        newSituationBtn.addEventListener('click', () => openModal());
        closeModalBtn.addEventListener('click', closeModal);
        cancelModalBtn.addEventListener('click', closeModal);
        saveSituationBtn.addEventListener('click', saveSituation);

        // Confirmation listeners
        okConfirmBtn.addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            closeConfirmModal();
        });
        cancelConfirmBtn.addEventListener('click', closeConfirmModal);
        closeConfirmBtn.addEventListener('click', closeConfirmModal);
    }

    function openConfirmModal() {
        confirmModal.classList.add('slds-fade-in-open');
        confirmBackdrop.classList.add('slds-backdrop_open');
    }

    function closeConfirmModal() {
        confirmModal.classList.remove('slds-fade-in-open');
        confirmBackdrop.classList.remove('slds-backdrop_open');
    }

    function showToast(msg, type) {
        if (window.showToast) window.showToast(msg, type);
        else alert(msg);
    }

    init();
});
