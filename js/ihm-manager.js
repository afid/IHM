/**
 * ihm-manager.js
 *
 * GESTIONNAIRE DES PARAMETRES IHM :
 * Ce fichier gère les opérations CRUD pour la table Core_Ddb_IHM.
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_IHM';

    // DOM Elements
    const paramsTableBody = document.getElementById('params-table-body');
    const newParamBtn = document.getElementById('new-param-btn');
    const paramModal = document.getElementById('param-editor-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const saveParamBtn = document.getElementById('save-param-btn');
    const addActionBtn = document.getElementById('add-action-btn');
    const actionsListContainer = document.getElementById('actions-list-container');
    const modalHeading = document.getElementById('modal-heading');

    // Form fields
    const paramType = document.getElementById('param-type');
    const paramName = document.getElementById('param-name');
    const paramNbInput = document.getElementById('param-nb-input');



    // Confirm Modal
    const confirmModal = document.getElementById('confirmation-modal');
    const confirmBackdrop = document.getElementById('confirmation-backdrop');
    const okConfirmBtn = document.getElementById('ok-confirm-btn');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const closeConfirmBtn = document.getElementById('close-confirm-btn');
    const confirmMessage = document.getElementById('confirm-message');

    // State
    let allParams = [];
    let currentParamId = null;
    let isEditMode = false;
    let confirmCallback = null;

    /**
     * Initialisation
     */
    async function init() {
        await loadParams();
        setupEventListeners();
    }

    /**
     * Charge les paramètres depuis DynamoDB
     */
    async function loadParams() {
        try {
            paramsTableBody.innerHTML = '<tr><td colspan="6" class="slds-text-align_center slds-p-around_medium">Chargement...</td></tr>';
            allParams = await window.dynamoDBService.scan(TABLE_NAME);
            renderParamsTable();
        } catch (err) {
            paramsTableBody.innerHTML = '<tr><td colspan="6" class="slds-text-align_center slds-text-color_error slds-p-around_medium">Erreur lors du chargement.</td></tr>';
        }
    }

    /**
     * Affiche le tableau des paramètres
     */
    function renderParamsTable() {
        if (!allParams || allParams.length === 0) {
            paramsTableBody.innerHTML = '<tr><td colspan="6" class="slds-text-align_center slds-p-around_medium">Aucun paramètre trouvé. Utilisez « Nouveau Paramètre » pour en créer.</td></tr>';
            return;
        }

        // Filtrer les paramètres pour ne pas afficher "Groupe Guides" et "Situations"
        // (On suppose que le type peut s'appeler 'Groupe de guides audio' ou similaire)
        const filteredParams = allParams.filter(p => {
            const t = p.Type || '';
            const typeStr = t.toLowerCase();
            return !typeStr.includes('groupe') && !typeStr.includes('guide') && !typeStr.includes('situation');
        });

        if (filteredParams.length === 0) {
            paramsTableBody.innerHTML = '<tr><td colspan="6" class="slds-text-align_center slds-p-around_medium">Aucun module trouvé.</td></tr>';
            return;
        }

        // Trier par Id
        filteredParams.sort((a, b) => (a.Id || 0) - (b.Id || 0));

        paramsTableBody.innerHTML = '';
        filteredParams.forEach(param => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${param.Id}</td>
                <td><span class="slds-badge">${param.Type || 'Module'}</span></td>
                <td><span class="slds-text-title_bold">${param.Name || ''}</span></td>
                <td class="slds-text-align_center">${param.NombreParamsInput ?? ''}</td>
                <td class="slds-cell-wrap">${(param.Parametres || []).join(', ')}</td>
                <td class="slds-text-align_right">
                    <div class="slds-button-group" role="group">
                        <button class="slds-button slds-button_icon slds-button_icon-border" onclick="window.editParam(${param.Id})" title="Éditer">
                            ✏️
                        </button>
                        <button class="slds-button slds-button_icon slds-button_icon-border slds-button_icon-error" onclick="window.deleteParam(${param.Id})" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            paramsTableBody.appendChild(tr);
        });
    }

    /**
     * Gère les événements
     */
    function setupEventListeners() {
        newParamBtn.addEventListener('click', () => openModal());
        closeModalBtn.addEventListener('click', closeModal);
        cancelModalBtn.addEventListener('click', closeModal);
        saveParamBtn.addEventListener('click', saveParam);
        addActionBtn.addEventListener('click', () => addActionInput(''));

        // Confirmation events
        closeConfirmBtn.addEventListener('click', closeConfirmModal);
        cancelConfirmBtn.addEventListener('click', closeConfirmModal);
        okConfirmBtn.addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            closeConfirmModal();
        });
    }



    /**
     * Ouvre le modal (création ou edition)
     */
    function openModal(param = null) {
        isEditMode = !!param;
        currentParamId = param ? param.Id : null;
        modalHeading.textContent = isEditMode ? `Éditer le paramètre #${currentParamId}` : 'Nouveau Paramètre';

        // Clear or populate form
        paramType.value = param ? (param.Type || 'Module') : 'Module';
        paramName.value = param ? (param.Name || '') : '';
        paramNbInput.value = param ? (param.NombreParamsInput ?? 0) : 0;
        actionsListContainer.innerHTML = '';

        if (param && param.Parametres) {
            param.Parametres.forEach(val => addActionInput(val));
        } else if (!isEditMode) {
            // Add one empty input for convenience
            addActionInput('');
        }

        paramModal.classList.add('slds-fade-in-open');
        modalBackdrop.classList.add('slds-backdrop_open');
    }

    /**
     * Ferme le modal
     */
    function closeModal() {
        paramModal.classList.remove('slds-fade-in-open');
        modalBackdrop.classList.remove('slds-backdrop_open');
    }

    /**
     * Ajoute un champ input pour une action
     */
    function addActionInput(value) {
        const div = document.createElement('div');
        div.className = 'slds-grid slds-m-bottom_x-small';
        div.innerHTML = `
            <div class="slds-col slds-grow">
                <input type="text" class="slds-input action-input" value="${value}" placeholder="Nom de l'action">
            </div>
            <div class="slds-col slds-no-flex slds-m-left_x-small">
                <button class="slds-button slds-button_icon slds-button_icon-border slds-button_icon-error" onclick="this.parentElement.parentElement.remove()" title="Supprimer">
                    ❌
                </button>
            </div>
        `;
        actionsListContainer.appendChild(div);
    }

    /**
     * Sauvegarde le paramètre
     */
    async function saveParam() {
        const name = paramName.value.trim();
        if (!name) {
            showToast("Le nom du module est obligatoire.", 'error');
            return;
        }

        const actions = Array.from(document.querySelectorAll('.action-input'))
            .map(input => input.value.trim())
            .filter(val => val !== '');

        const item = {
            Type: paramType.value,
            Name: name,
            NombreParamsInput: parseInt(paramNbInput.value) || 0,
            Parametres: actions
        };

        if (isEditMode) {
            item.Id = currentParamId;
        } else {
            // Auto-increment simple : Max Id + 1
            const maxId = allParams.reduce((max, p) => Math.max(max, p.Id || 0), 0);
            item.Id = maxId + 1;
        }

        try {
            saveParamBtn.disabled = true;
            saveParamBtn.textContent = 'Sauvegarde...';

            await window.dynamoDBService.put(TABLE_NAME, item);
            showToast("Paramètre sauvegardé avec succès.", 'success');
            closeModal();
            await loadParams();
        } catch (err) {
            // Erreur gérée par le service
        } finally {
            saveParamBtn.disabled = false;
            saveParamBtn.textContent = 'Sauvegarder';
        }
    }

    /**
     * Expose editParam globalement
     */
    window.editParam = (id) => {
        const param = allParams.find(p => p.Id === id);
        if (param) openModal(param);
    };

    /**
     * Expose deleteParam globalement
     */
    window.deleteParam = (id) => {
        confirmMessage.textContent = `Êtes-vous sûr de vouloir supprimer définitivement le paramètre #${id} ?`;
        confirmCallback = async () => {
            try {
                await window.dynamoDBService.delete(TABLE_NAME, { Id: id });
                showToast("Paramètre supprimé.", 'success');
                await loadParams();
            } catch (err) {
                // Erreur gérée par le service
            }
        };
        openConfirmModal();
    };

    function openConfirmModal() {
        confirmModal.classList.add('slds-fade-in-open');
        confirmBackdrop.classList.add('slds-backdrop_open');
    }

    function closeConfirmModal() {
        confirmModal.classList.remove('slds-fade-in-open');
        confirmBackdrop.classList.remove('slds-backdrop_open');
    }

    // Gestion des popups toast (reprise de utils.js si dispo, sinon fallback simple)
    function showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // Lancer l'init
    init();
});
