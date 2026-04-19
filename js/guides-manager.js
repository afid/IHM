/**
 * guides-manager.js
 *
 * GESTIONNAIRE DES GROUPEMENTS DE GUIDES VOCAUX :
 * Ce fichier gère toutes les opérations CRUD (Create, Read, Update, Delete)
 * pour les groupements de guides stockés dans la table Core_Ddb_IHM
 * avec Type = 'GroupeGuides'.
 *
 * Structure d'un groupement :
 *   - Id              : Number (PK, auto-incrémenté)
 *   - Type            : String = 'GroupeGuides'
 *   - Name            : String (nom du groupement)
 *   - GuideDissuasion : String (_DIS_)
 *   - GuidesAttente   : String (_ATT_)
 *   - GuidesMiseEnRelation : List/String (_MER_) — tableau de strings
 *
 * Les listes de guides disponibles sont lues depuis l'item Core_Mod_GuidesVocaux
 * de la table Core_Ddb_IHM (champ Parametres, liste de strings).
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_IHM';
    const TYPE_GROUPE = 'GroupeGuides';
    const GUIDES_MODULE_NAME = 'Core_Mod_GuidesVocaux';

    // DOM Elements — table
    const tableBody = document.getElementById('groupes-table-body');
    const newGroupeBtn = document.getElementById('new-groupe-btn');

    // DOM Elements — editor modal
    const editorModal = document.getElementById('guides-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const cancelEditorBtn = document.getElementById('cancel-editor-btn');
    const saveGroupeBtn = document.getElementById('save-groupe-btn');
    const modalTitle = document.getElementById('modal-title');

    const inputName = document.getElementById('editor-groupe-name');
    const selectDis = document.getElementById('editor-guide-dis');
    const selectAtt = document.getElementById('editor-guide-att');

    // Guides MER (multi-select)
    const guidesMerContainer = document.getElementById('editor-guides-mer-container');
    const addGuideMerBtn = document.getElementById('add-guide-mer-btn');

    // DOM Elements — confirmation modal
    const confirmModal = document.getElementById('confirmation-modal');
    const confirmBackdrop = document.getElementById('confirmation-backdrop');
    const closeConfirmBtn = document.getElementById('close-confirm-btn');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const okConfirmBtn = document.getElementById('ok-confirm-btn');
    const confirmMessage = document.getElementById('confirm-message');

    // State
    let allItems = [];         // Tous les items de Core_Ddb_IHM (pour calculer le max Id)
    let allGroupements = [];   // Uniquement les Type='GroupeGuides'
    let currentItem = null;    // Item en cours d'édition
    let isEditMode = false;
    let confirmCallback = null;

    // Guides lists
    let guidesDissuasion = [];
    let guidesAttente = [];
    let guidesMER = [];

    // =========================================================
    // CHARGEMENT DES DONNÉES
    // =========================================================

    /**
     * Charge tous les items de Core_Ddb_IHM et filtre les GroupeGuides
     */
    async function loadGroupements() {
        try {
            tableBody.innerHTML = '<tr><td colspan="5" class="slds-text-align_center slds-p-around_medium">Chargement...</td></tr>';
            allItems = await window.dynamoDBService.scan(TABLE_NAME) || [];
            allGroupements = allItems.filter(item => item.Type === TYPE_GROUPE);
            renderTable();
        } catch (err) {
            tableBody.innerHTML = '<tr><td colspan="5" class="slds-text-align_center slds-text-color_error slds-p-around_medium">Erreur lors du chargement.</td></tr>';
        }
    }

    /**
     * Charge les guides vocaux disponibles depuis Core_Mod_GuidesVocaux (item de Core_Ddb_IHM)
     */
    async function loadGuidesVocaux() {
        try {
            // Utilise maintenant l'API Amazon Connect au lieu de DynamoDB
            const allGuides = await window.connectService.listAllPrompts();

            guidesDissuasion = allGuides.filter(g => g.includes('_DIS_')).sort();
            guidesAttente = allGuides.filter(g => g.includes('_ATT_')).sort();
            guidesMER = allGuides.filter(g => g.includes('_MER_')).sort();
        } catch (err) {
            console.error('Erreur lors du chargement des guides vocaux via Connect:', err);
            showToast('Erreur : impossible de lister les guides vocaux depuis Amazon Connect.', 'error');
        }
    }

    /**
     * Remplit un select avec une liste de guides (strings)
     */
    function populateSelect(selectEl, guidesList, selectedValue = '') {
        selectEl.innerHTML = '<option value="">-- Aucun --</option>';
        guidesList.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === selectedValue) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    // =========================================================
    // GESTION DES GUIDES MER MULTIPLES
    // =========================================================

    /**
     * Ajoute une ligne select pour un guide MER dans le conteneur
     */
    function addGuideMerRow(selectedValue = '') {
        const row = document.createElement('div');
        row.className = 'guide-mer-row';

        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'slds-select_container guide-mer-select-wrapper';
        const select = document.createElement('select');
        select.className = 'slds-select guide-mer-select';
        select.innerHTML = '<option value="">-- Aucun --</option>';
        guidesMER.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === selectedValue) opt.selected = true;
            select.appendChild(opt);
        });
        selectWrapper.appendChild(select);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'slds-button slds-button_icon slds-button_icon-error guide-mer-remove-btn';
        removeBtn.type = 'button';
        removeBtn.title = 'Supprimer ce guide';
        removeBtn.textContent = '\u2715';
        removeBtn.addEventListener('click', () => {
            row.remove();
            if (guidesMerContainer.children.length === 0) addGuideMerRow('');
        });

        row.appendChild(selectWrapper);
        row.appendChild(removeBtn);
        guidesMerContainer.appendChild(row);
    }

    /**
     * Initialise le conteneur MER avec une liste de valeurs
     */
    function populateGuidesMerMulti(values) {
        guidesMerContainer.innerHTML = '';
        if (Array.isArray(values) && values.length > 0) {
            values.forEach(v => addGuideMerRow(v));
        } else if (typeof values === 'string' && values) {
            addGuideMerRow(values);
        } else {
            addGuideMerRow('');
        }
    }

    /**
     * Récupère la liste des guides MER sélectionnés (filtre les vides)
     */
    function getGuidesMerFromForm() {
        const values = [];
        guidesMerContainer.querySelectorAll('.guide-mer-select').forEach(sel => {
            const v = sel.value.trim();
            if (v) values.push(v);
        });
        return values;
    }

    // =========================================================
    // AFFICHAGE DU TABLEAU
    // =========================================================

    function renderTable() {
        if (!allGroupements || allGroupements.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="slds-text-align_center slds-p-around_medium">Aucun groupement trouvé. Cliquez sur « Nouveau Groupement » pour en créer un.</td></tr>';
            return;
        }

        // Trier par Name
        const sorted = [...allGroupements].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

        tableBody.innerHTML = '';
        sorted.forEach(item => {
            const tr = document.createElement('tr');
            let merDisplay = '—';
            if (item.GuidesMiseEnRelation) {
                if (Array.isArray(item.GuidesMiseEnRelation)) {
                    merDisplay = item.GuidesMiseEnRelation.length > 0 ? item.GuidesMiseEnRelation.map(g => escapeHtml(g)).join('<br>') : '—';
                } else {
                    merDisplay = escapeHtml(item.GuidesMiseEnRelation);
                }
            }
            tr.innerHTML = `
                <td><span class="slds-text-title_bold">${escapeHtml(item.Name || '')}</span></td>
                <td><span class="guide-badge guide-dis">${escapeHtml(item.GuideDissuasion || '—')}</span></td>
                <td><span class="guide-badge guide-att">${escapeHtml(item.GuidesAttente || '—')}</span></td>
                <td><span class="guide-badge guide-mer">${merDisplay}</span></td>
                <td class="slds-text-align_right">
                    <div class="slds-button-group" role="group">
                        <button class="slds-button slds-button_icon slds-button_icon-border"
                            onclick="window.editGroupe(${item.Id})" title="Éditer">
                            ✏️
                        </button>
                        <button class="slds-button slds-button_icon slds-button_icon-border slds-button_icon-error"
                            onclick="window.deleteGroupe(${item.Id})" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // =========================================================
    // GESTION DE LA MODALE D'ÉDITION
    // =========================================================

    function openNewModal() {
        isEditMode = false;
        currentItem = null;
        modalTitle.textContent = 'Nouveau Groupement';

        inputName.value = '';
        inputName.removeAttribute('readonly');

        populateSelect(selectDis, guidesDissuasion);
        populateSelect(selectAtt, guidesAttente);
        populateGuidesMerMulti([]);

        showModal(editorModal, editorBackdrop);
    }

    function openEditModal(item) {
        isEditMode = true;
        currentItem = item;
        modalTitle.textContent = `Éditer : ${item.Name}`;

        inputName.value = item.Name || '';
        inputName.setAttribute('readonly', true);

        populateSelect(selectDis, guidesDissuasion, item.GuideDissuasion || '');
        populateSelect(selectAtt, guidesAttente, item.GuidesAttente || '');
        populateGuidesMerMulti(item.GuidesMiseEnRelation || []);

        showModal(editorModal, editorBackdrop);
    }

    // =========================================================
    // SAUVEGARDE / SUPPRESSION
    // =========================================================

    async function saveGroupement() {
        const name = inputName.value.trim();
        if (!name) {
            showToast('Le nom du groupement est obligatoire.', 'error');
            return;
        }

        const merValues = getGuidesMerFromForm();

        const item = {
            Type: TYPE_GROUPE,
            Name: name,
            GuideDissuasion: selectDis.value || '',
            GuidesAttente: selectAtt.value || '',
            GuidesMiseEnRelation: merValues.length > 0 ? merValues : []
        };

        if (isEditMode && currentItem) {
            item.Id = currentItem.Id;
        } else {
            // Auto-incrément basé sur le max Id tous types confondus
            const maxId = allItems.reduce((max, p) => Math.max(max, Number(p.Id) || 0), 0);
            item.Id = maxId + 1;
        }

        try {
            saveGroupeBtn.disabled = true;
            saveGroupeBtn.textContent = 'Sauvegarde...';

            await window.dynamoDBService.put(TABLE_NAME, item);
            showToast('Groupement sauvegardé avec succès.', 'success');
            hideModal(editorModal, editorBackdrop);
            await loadGroupements();
        } catch (err) {
            // Erreur gérée par le service
        } finally {
            saveGroupeBtn.disabled = false;
            saveGroupeBtn.textContent = 'Sauvegarder';
        }
    }

    async function deleteGroupement(id) {
        try {
            await window.dynamoDBService.delete(TABLE_NAME, { Id: id });
            showToast('Groupement supprimé avec succès.', 'success');
            await loadGroupements();
        } catch (err) {
            // Erreur gérée par le service
        }
    }

    // =========================================================
    // EXPOSITION GLOBALE (appelée depuis les boutons du tableau)
    // =========================================================

    window.editGroupe = (id) => {
        const item = allGroupements.find(g => g.Id === id);
        if (item) openEditModal(item);
    };

    window.deleteGroupe = (id) => {
        const item = allGroupements.find(g => g.Id === id);
        const name = item ? item.Name : `#${id}`;
        confirmMessage.textContent = `Êtes-vous sûr de vouloir supprimer le groupement "${name}" ? Cette action ne peut pas être annulée.`;
        confirmCallback = () => deleteGroupement(id);
        showModal(confirmModal, confirmBackdrop);
    };

    // =========================================================
    // UTILITAIRES MODAL
    // =========================================================

    function showModal(modal, backdrop) {
        if (!modal || !backdrop) return;
        modal.classList.remove('slds-hide');
        modal.classList.add('slds-fade-in-open');
        backdrop.classList.remove('slds-hide');
        backdrop.classList.add('slds-backdrop_open');
    }

    function hideModal(modal, backdrop) {
        if (!modal || !backdrop) return;
        modal.classList.remove('slds-fade-in-open');
        modal.classList.add('slds-hide');
        backdrop.classList.remove('slds-backdrop_open');
        backdrop.classList.add('slds-hide');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================
    // EVENT LISTENERS
    // =========================================================

    newGroupeBtn.addEventListener('click', () => openNewModal());

    closeEditorBtn.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    cancelEditorBtn.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    editorBackdrop.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    saveGroupeBtn.addEventListener('click', () => saveGroupement());
    addGuideMerBtn.addEventListener('click', () => addGuideMerRow(''));

    closeConfirmBtn.addEventListener('click', () => hideModal(confirmModal, confirmBackdrop));
    cancelConfirmBtn.addEventListener('click', () => hideModal(confirmModal, confirmBackdrop));
    confirmBackdrop.addEventListener('click', () => hideModal(confirmModal, confirmBackdrop));
    okConfirmBtn.addEventListener('click', () => {
        hideModal(confirmModal, confirmBackdrop);
        if (confirmCallback) confirmCallback();
    });

    // =========================================================
    // INITIALISATION
    // =========================================================

    Promise.all([loadGuidesVocaux(), loadGroupements()]);
});
