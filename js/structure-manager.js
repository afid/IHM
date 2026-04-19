/**
 * structure-manager.js
 *
 * GESTIONNAIRE DES STRUCTURES :
 * Ce fichier gère toutes les opérations CRUD pour la table Core_Ddb_ParametrageCentralise.
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_ParametrageCentralise';

    // Éléments DOM
    const marqueSelect = document.getElementById('marque-select');
    const domaineFilterContainer = document.getElementById('domaine-filter-container');
    const domaineSelect = document.getElementById('domaine-select');
    const sousDomaineFilterContainer = document.getElementById('sous-domaine-filter-container');
    const sousDomaineSelect = document.getElementById('sous-domaine-select');

    const newStructureBtn = document.getElementById('new-structure-btn');
    const structureDetailsContainer = document.getElementById('structure-details-container');
    const detailStructureName = document.getElementById('detail-structure-name');
    const structureDetailsContent = document.getElementById('structure-details-content');

    // Modal elements
    const editorModal = document.getElementById('structure-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const cancelEditorBtn = document.getElementById('cancel-editor-btn');
    const saveStructureBtn = document.getElementById('save-structure-btn');
    const editorTitle = document.getElementById('editor-title');

    // Fields
    const editorStructure = document.getElementById('editor-structure');
    const editorType = document.getElementById('editor-type');
    const editorMoteur = document.getElementById('editor-moteur');
    const editorParent = document.getElementById('editor-parent');

    const addSituationBtn = document.getElementById('add-situation-btn');
    const situationsContainer = document.getElementById('situations-container');

    // Current state
    let currentStructure = null;
    let isEditMode = false;
    let allStructures = [];

    /**
     * Helper: Convertit DD/MM/YYYY vers YYYY-MM-DD (pour l'input date)
     */
    function dbToDateInput(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('/');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    /**
     * Helper: Convertit YYYY-MM-DD vers DD/MM/YYYY (pour la DB)
     */
    function dateInputToDb(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    /**
     * Charge la liste des structures
     */
    async function loadStructures() {
        try {
            marqueSelect.innerHTML = '<option value="">Chargement...</option>';
            const items = await window.dynamoDBService.scan(TABLE_NAME);
            allStructures = items || [];

            // Trier par nom de structure
            allStructures.sort((a, b) => (a.Structure || '').localeCompare(b.Structure || ''));

            populateMarques();
            populateParentSelect();
        } catch (err) {
            marqueSelect.innerHTML = '<option value="">Erreur chargement</option>';
        }
    }

    /**
     * Remplit le menu des Marques
     */
    function populateMarques() {
        marqueSelect.innerHTML = '<option value="">Sélectionner une marque...</option>';

        allStructures
            .filter(s => (s.Type || '').toLowerCase() === 'marque' && (s.Structure || '').toLowerCase() !== 'default')
            .forEach(item => {
                const option = document.createElement('option');
                option.value = item.Structure;
                option.textContent = item.Structure;
                marqueSelect.appendChild(option);
            });
    }

    /**
     * Remplit le menu des Domaines selon la marque parente
     */
    function populateDomaines(parentMarque) {
        domaineSelect.innerHTML = '<option value="">Sélectionner un domaine...</option>';

        const domaines = allStructures.filter(s =>
            (s.Type || '').toLowerCase() === 'domaine' && s.Parent === parentMarque
        );

        if (domaines.length > 0) {
            domaines.forEach(item => {
                const option = document.createElement('option');
                option.value = item.Structure;
                option.textContent = item.Structure;
                domaineSelect.appendChild(option);
            });
            domaineFilterContainer.classList.remove('slds-hide');
        } else {
            domaineFilterContainer.classList.add('slds-hide');
        }

        // Cacher le niveau suivant
        sousDomaineFilterContainer.classList.add('slds-hide');
    }

    /**
     * Remplit le menu des Sous-domaines selon le domaine parent
     */
    function populateSousDomaines(parentDomaine) {
        sousDomaineSelect.innerHTML = '<option value="">Sélectionner un sous-domaine...</option>';

        const sousDomaines = allStructures.filter(s =>
            (s.Type || '').toLowerCase() === 'sous-domaine' && s.Parent === parentDomaine
        );

        if (sousDomaines.length > 0) {
            sousDomaines.forEach(item => {
                const option = document.createElement('option');
                option.value = item.Structure;
                option.textContent = item.Structure;
                sousDomaineSelect.appendChild(option);
            });
            sousDomaineFilterContainer.classList.remove('slds-hide');
        } else {
            sousDomaineFilterContainer.classList.add('slds-hide');
        }
    }

    /**
     * Remplit le menu Parent dans l'éditeur (toutes structures)
     */
    function populateParentSelect() {
        const currentParentVal = editorParent.value;
        const selectedType = (editorType.value || '').toLowerCase();
        editorParent.innerHTML = '<option value="">Aucun</option>';

        allStructures.forEach(item => {
            const itemType = (item.Type || '').toLowerCase();
            let shouldShow = false;

            if (selectedType === 'domaine') {
                // Un Domaine a une Marque comme parent
                if (itemType === 'marque') shouldShow = true;
            } else if (selectedType === 'sous-domaine') {
                // Un Sous-domaine a un Domaine comme parent
                if (itemType === 'domaine') shouldShow = true;
            } else if (selectedType === 'marque') {
                // Pour une Marque, on n'affiche rien (le champ sera désactivé)
                shouldShow = false;
            } else {
                // Cas par défaut : on montre tout
                shouldShow = true;
            }

            if (shouldShow) {
                const option = document.createElement('option');
                option.value = item.Structure;
                option.textContent = `${item.Structure} (${item.Type || 'n/a'})`;
                editorParent.appendChild(option);
            }
        });

        if (currentParentVal) editorParent.value = currentParentVal;
    }

    /**
     * Affiche les détails d'une structure et de ses enfants directs
     */
    function displayDetails(mainStructure) {
        detailStructureName.textContent = mainStructure.Structure;
        structureDetailsContent.innerHTML = '';

        // 1. Afficher la structure principale
        renderStructureBlock(mainStructure, true);

        // 2. Trouver et afficher les enfants directs
        const children = allStructures.filter(s => s.Parent === mainStructure.Structure);
        if (children.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'slds-col slds-size_1-of-1 slds-m-vertical_medium slds-theme_shade slds-p-around_x-small slds-text-heading_small';
            separator.textContent = `Enfants de : ${mainStructure.Structure}`;
            structureDetailsContent.appendChild(separator);

            children.forEach(child => {
                renderStructureBlock(child, false);
            });
        }

        structureDetailsContainer.classList.remove('slds-hide');
    }

    /**
     * Helper pour rendre un bloc de détails de structure
     */
    function renderStructureBlock(structure, isMain) {
        const blockContainer = document.createElement('div');
        blockContainer.className = `slds-col slds-size_1-of-1 slds-m-bottom_medium slds-box slds-box_x-small ${isMain ? 'slds-theme_default' : 'slds-theme_shade'}`;

        // Header du bloc avec titre et boutons d'action
        const header = document.createElement('div');
        header.className = 'slds-grid slds-grid_vertical-align-center slds-m-bottom_small';

        header.innerHTML = `
            <div class="slds-col">
                <h3 class="slds-text-heading_label">
                    ${structure.Structure} (${structure.Type})
                </h3>
            </div>
            <div class="slds-col slds-no-flex">
                <button class="slds-button slds-button_icon slds-button_icon-border-filled edit-block-btn" title="Éditer">
                    ✏️
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border-filled duplicate-block-btn slds-m-left_xx-small" title="Dupliquer">
                    📋
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border-filled slds-button_icon-error delete-block-btn slds-m-left_xx-small" title="Supprimer">
                    🗑️
                </button>
            </div>
        `;
        blockContainer.appendChild(header);

        // Listeners pour les boutons d'action du bloc
        header.querySelector('.edit-block-btn').addEventListener('click', () => {
            currentStructure = structure;
            openEditor(true);
        });

        header.querySelector('.duplicate-block-btn').addEventListener('click', () => {
            currentStructure = structure;
            duplicateStructure();
        });

        header.querySelector('.delete-block-btn').addEventListener('click', () => {
            currentStructure = structure;
            deleteStructure();
        });

        const fieldsGrid = document.createElement('div');
        fieldsGrid.className = 'slds-grid slds-wrap slds-gutters_small';

        const fields = [
            { label: 'Structure', value: structure.Structure },
            { label: 'Type', value: structure.Type },
            { label: 'Moteur de Décision', value: structure.MoteurDecision },
            { label: 'Parent', value: structure.Parent }
        ];

        if (structure.Situations) {
            Object.entries(structure.Situations).forEach(([nom, data]) => {
                fields.push({
                    label: `Période : ${nom}`,
                    value: `Du ${data.DateDebut} au ${data.DateFin} (Priorité: ${data.Preponderance})`
                });
            });
        }

        fields.forEach(field => {
            if (field.value !== undefined && field.value !== null && field.value !== '') {
                const col = document.createElement('div');
                col.className = 'slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-m-bottom_x-small slds-border_bottom slds-p-bottom_x-small';
                col.innerHTML = `
                    <div class="slds-form-element">
                        <span class="slds-form-element__label slds-text-title_bold">${field.label}</span>
                        <div class="slds-form-element__static">${field.value}</div>
                    </div>
                `;
                fieldsGrid.appendChild(col);
            }
        });

        blockContainer.appendChild(fieldsGrid);
        structureDetailsContent.appendChild(blockContainer);
    }

    /**
     * Ouvre le modal d'édition
     */
    function openEditor(editMode = false) {
        isEditMode = editMode;
        clearForm();

        if (editMode && currentStructure) {
            editorTitle.textContent = 'Modifier la Marque : ' + currentStructure.Structure;
            editorStructure.value = currentStructure.Structure;
            editorStructure.disabled = true;
            editorType.value = currentStructure.Type || 'marque';
            toggleParentField(); // Met à jour le filtrage avant de setter la valeur
            editorMoteur.value = currentStructure.MoteurDecision || 'CoreDecision';
            editorParent.value = currentStructure.Parent || '';
        } else {
            currentStructure = null; // Important: reset source for new structure
            editorTitle.textContent = 'Nouvelle Marque / Domaine / Sous-domaine';
            editorStructure.disabled = false;
            toggleParentField();
        }

        editorModal.classList.add('slds-fade-in-open');
        editorBackdrop.classList.add('slds-backdrop_open');
    }

    function closeEditor() {
        editorModal.classList.remove('slds-fade-in-open');
        editorBackdrop.classList.remove('slds-backdrop_open');
    }

    function clearForm() {
        editorStructure.value = '';
        editorMoteur.value = 'CoreDecision';
        editorParent.value = '';
        toggleParentField();
    }

    /**
     * Gère l'activation et le filtrage du champ Parent selon le type
     */
    function toggleParentField() {
        populateParentSelect();
        const type = (editorType.value || '').toLowerCase();

        if (type === 'marque') {
            editorParent.value = '';
            editorParent.disabled = true;
            editorParent.closest('.slds-select_container').classList.add('slds-is-disabled');
        } else {
            editorParent.disabled = false;
            editorParent.closest('.slds-select_container').classList.remove('slds-is-disabled');
        }
    }

    /**
     * Sauvegarde la structure
     */
    async function saveStructure() {
        const structureName = editorStructure.value.trim();
        if (!structureName) {
            showToast("Le nom de la structure est obligatoire", 'error');
            return;
        }

        const data = {
            ...(currentStructure || {}), // Préserver toutes les données existantes (Situations, Etat, etc.)
            Structure: structureName,
            Type: editorType.value,
            MoteurDecision: editorMoteur.value,
            Parent: editorParent.value || ""
        };

        // Supprimer explicitement les Situations si vides (DynamoDB n'accepte pas les maps vides selon config)
        if (!data.Situations) delete data.Situations;

        saveStructureBtn.disabled = true;
        try {
            await window.dynamoDBService.put(TABLE_NAME, data);
            showToast("Structure sauvegardée avec succès", 'success');
            closeEditor();
            await loadStructures();
            hideDetails();
        } catch (err) {
            // Erreur déjà gérée par le service
        } finally {
            saveStructureBtn.disabled = false;
        }
    }

    /**
     * Supprime la structure
     */
    async function deleteStructure() {
        if (!currentStructure) return;

        showConfirmModal(
            "Supprimer la structure",
            `Voulez-vous vraiment supprimer la structure "${currentStructure.Structure}" ?`,
            async () => {
                try {
                    await window.dynamoDBService.delete(TABLE_NAME, { Structure: currentStructure.Structure });
                    showToast("Structure supprimée", 'success');
                    currentStructure = null;
                    structureDetailsContainer.classList.add('slds-hide');
                    await loadStructures();
                } catch (err) { }
            }
        );
    }

    /**
     * Duplique la structure sélectionnée
     */
    function duplicateStructure() {
        if (!currentStructure) return;

        isEditMode = false;
        // On NE reset PAS currentStructure ici car c'est notre source
        const sourceData = JSON.parse(JSON.stringify(currentStructure));

        clearForm();
        currentStructure = sourceData; // Restaurer la source pour le saveStructure ultérieur

        editorTitle.textContent = 'Dupliquer la Structure : ' + currentStructure.Structure;
        editorStructure.value = currentStructure.Structure + '_COPY';
        editorStructure.disabled = false;
        editorType.value = currentStructure.Type || 'domaine';
        editorMoteur.value = currentStructure.MoteurDecision || 'CoreDecision';
        editorParent.value = currentStructure.Parent || '';

        editorModal.classList.add('slds-fade-in-open');
        editorBackdrop.classList.add('slds-backdrop_open');
        toggleParentField();
    }

    // Listeners
    marqueSelect.addEventListener('change', () => {
        const val = marqueSelect.value;
        currentStructure = allStructures.find(s => s.Structure === val);
        if (currentStructure) {
            displayDetails(currentStructure);
            populateDomaines(val);
        } else {
            hideDetails();
            domaineFilterContainer.classList.add('slds-hide');
            sousDomaineFilterContainer.classList.add('slds-hide');
        }
    });

    domaineSelect.addEventListener('change', () => {
        const val = domaineSelect.value;
        if (val) {
            currentStructure = allStructures.find(s => s.Structure === val);
            if (currentStructure) {
                displayDetails(currentStructure);
                populateSousDomaines(val);
            }
        } else {
            const parentMarque = marqueSelect.value;
            currentStructure = allStructures.find(s => s.Structure === parentMarque);
            if (currentStructure) displayDetails(currentStructure);
            sousDomaineFilterContainer.classList.add('slds-hide');
        }
    });

    sousDomaineSelect.addEventListener('change', () => {
        const val = sousDomaineSelect.value;
        if (val) {
            currentStructure = allStructures.find(s => s.Structure === val);
            if (currentStructure) displayDetails(currentStructure);
        } else {
            const parentDomaine = domaineSelect.value;
            currentStructure = allStructures.find(s => s.Structure === parentDomaine);
            if (currentStructure) displayDetails(currentStructure);
        }
    });

    function formatDate(isoDate) {
        if (!isoDate) return '';
        const [y, m, d] = isoDate.split('-');
        return `${d}/${m}/${y}`;
    }

    function hideDetails() {
        structureDetailsContainer.classList.add('slds-hide');
        currentStructure = null;
    }

    newStructureBtn.addEventListener('click', () => openEditor(false));
    closeEditorBtn.addEventListener('click', closeEditor);
    cancelEditorBtn.addEventListener('click', closeEditor);
    saveStructureBtn.addEventListener('click', saveStructure);
    editorType.addEventListener('change', toggleParentField);

    // Initialisation
    loadStructures();
});
