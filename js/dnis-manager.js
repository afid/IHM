/**
 * dnis-manager.js
 *
 * GESTIONNAIRE DES DNIS (Numéros d'appel) :
 * Ce fichier gère toutes les opérations CRUD (Create, Read, Update, Delete)
 * pour les paramètres des DNIS stockés dans DynamoDB.
 * Utilise window.dynamoDBService pour l'accès aux données.
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_CollecteParametrage';
    const MODULES_TABLE = 'Core_Ddb_IHM';
    const CALENDARS_TABLE = 'Core_Ddb_Calendriers';

    const STRUCTURES_TABLE = 'Core_Ddb_ParametrageCentralise';
    const ADMIN_FIELDS = ['Ani Simulation', 'Date Simulation', 'Logger Actif', 'Voix Acteur', 'Ani_Simulation', 'Date_Simulation', 'Voix_Acteur', 'Logger_Actif'];

    // Éléments DOM
    const dnisSelect = document.getElementById('dnis-select');
    const newDnisBtn = document.getElementById('new-dnis-btn');
    const editDnisBtn = document.getElementById('edit-dnis-btn');
    const duplicateDnisBtn = document.getElementById('duplicate-dnis-btn');
    const deleteDnisBtn = document.getElementById('delete-dnis-btn');
    const editDnisContainer = document.getElementById('edit-dnis-container');
    const dnisDetailsContainer = document.getElementById('dnis-details-container');

    // Modal elements
    const editorModal = document.getElementById('dnis-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const cancelEditorBtn = document.getElementById('cancel-editor-btn');
    const saveDnisBtn = document.getElementById('save-dnis-btn');
    const editorTitle = document.getElementById('editor-title');
    const toggleAdminDetailsBtn = document.getElementById('toggle-admin-details-btn');
    const toggleAdminEditorBtn = document.getElementById('toggle-admin-editor-btn');

    // Module elements
    const moduleSelect = document.getElementById('module-select');
    const addModuleBtn = document.getElementById('add-module-btn');
    const modulesContainer = document.getElementById('modules-container');

    // Current state
    let currentDNIS = null;
    let isEditMode = false;
    let availableModules = [];
    const editorGuard = window.createUnsavedChangesGuard ? window.createUnsavedChangesGuard('dnis-editor-modal') : null;
    let configuredModules = [];
    let allStructures = [];
    let draggedItemIndex = null;
    let isAdminVisibleDetails = false;
    let isAdminVisibleEditor = false;

    /**
     * Charge la liste des modules disponibles depuis Core_Ddb_IHM
     */
    async function loadAvailableModules() {
        try {
            // Indiquer le chargement dans le dropdown
            moduleSelect.innerHTML = '<option value="">Chargement des modules...</option>';
            moduleSelect.disabled = true;

            const items = await window.dynamoDBService.scan(MODULES_TABLE);

            // On ne garde que les modules commençant par shared-core-euc1-flux-mod_ ou Usage_Mod_
            availableModules = (items || []).filter(module => {
                const name = module.Name || '';
                return name.startsWith('shared-core-euc1-flux-mod_') || name.startsWith('Usage_Mod_');
            });

            // GESTION DYNAMIQUE DES PROMPTS AMAZON CONNECT
            // Recherche robuste du module GuidesVocaux (trim et sensible à la casse)
            const guidesModuleName = 'shared-core-euc1-flux-mod_GuidesVocaux';
            const guidesModule = availableModules.find(m => (m.Name || '').trim() === guidesModuleName);

            if (guidesModule && window.connectService) {
                console.log("Amazon ConnectService trouvé, tentative de récupération des prompts pour", guidesModuleName);
                try {
                    const prompts = await window.connectService.listAllPrompts();
                    if (prompts && prompts.length > 0) {
                        // Remplacer les paramètres DynamoDB par les prompts réels de Connect
                        // On les trie par ordre alphabétique pour plus de confort
                        guidesModule.Parametres = prompts.sort();
                        //console.log(`ConnectService: ${prompts.length} prompts récupérés avec succès.`);
                    } else {
                        console.warn("Amazon ConnectService: Aucun prompt trouvé sous Amazon Connect pour", guidesModuleName);
                    }
                } catch (connectErr) {
                    console.error("Amazon ConnectService: Erreur lors de l'appel à listAllPrompts:", connectErr);
                    // On garde les paramètres par défaut de DynamoDB en cas d'erreur
                }
            }

            // GESTION DYNAMIQUE DES CALENDRIERS
            // Recherche robuste des modules Calendrier
            const calendarModules = availableModules.filter(m => (m.Name || '').includes('mod_Calendrier'));

            if (calendarModules.length > 0) {
                try {
                    const calendars = await window.dynamoDBService.scan(CALENDARS_TABLE);
                    if (calendars && calendars.length > 0) {
                        const calendarOptions = calendars
                            .filter(c => c.id_Calendar)
                            .map(c => ({
                                value: c.id_Calendar,
                                label: c.Nom || c.id_Calendar
                            }))
                            .sort((a, b) => a.label.localeCompare(b.label));

                        calendarModules.forEach(calMod => {
                            calMod.Parametres = calendarOptions;
                        });
                        console.log(`DynamoDB(${CALENDARS_TABLE}): ${calendarOptions.length} calendriers récupérés avec succès.`);
                    }
                } catch (calErr) {
                    console.error("Erreur lors de la récupération des calendriers:", calErr);
                }
            }

            // Trier les modules par nom pour le dropdown
            availableModules.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

            // Remplir le dropdown final
            moduleSelect.innerHTML = '<option value="">Sélectionner un module...</option>';
            availableModules.forEach(module => {
                const option = document.createElement('option');
                option.value = module.Id;
                const paramLabel = module.NombreParamsInput === 1 ? '1 action' : 'multi-actions';
                option.textContent = `${module.Name} (${paramLabel})`;
                moduleSelect.appendChild(option);
            });
            moduleSelect.disabled = false;

        } catch (err) {
            console.error("Erreur critique lors du chargement des modules:", err);
            moduleSelect.innerHTML = '<option value="">Erreur de chargement</option>';
            moduleSelect.disabled = false;
        }
    }

    /**
     * Charge la liste des structures depuis Core_Ddb_ParametrageCentralise
     */
    async function loadStructures() {
        try {
            const items = await window.dynamoDBService.scan(STRUCTURES_TABLE);
            allStructures = items || [];
            allStructures.sort((a, b) => (a.Structure || '').localeCompare(b.Structure || ''));

            populateStructureDropdowns();
        } catch (err) {
            console.error("Erreur lors du chargement des structures:", err);
        }
    }

    /**
     * Remplit les menus déroulants Marque, Domaine et Sous-domaine
     */
    function populateStructureDropdowns() {
        const marqueSelect = document.getElementById('editor-marque');
        const domaineSelect = document.getElementById('editor-domaine');
        const sousDomaineSelect = document.getElementById('editor-sous-domaine');

        if (!marqueSelect || !domaineSelect || !sousDomaineSelect) return;

        let marqueHtml = '<option value="">-- Sélectionner une Marque --</option>';
        let domaineHtml = '<option value="">-- Sélectionner un Domaine --</option>';
        let sousDomaineHtml = '<option value="">-- Sélectionner un Sous-domaine --</option>';

        allStructures.forEach(struct => {
            const val = struct.Structure;
            const type = (struct.Type || '').toLowerCase();

            if (type === 'marque') {
                marqueHtml += `<option value="${val}">${val}</option>`;
            } else if (type === 'domaine') {
                domaineHtml += `<option value="${val}">${val}</option>`;
            } else if (type === 'sous-domaine') {
                sousDomaineHtml += `<option value="${val}">${val}</option>`;
            }
        });

        marqueSelect.innerHTML = marqueHtml;
        domaineSelect.innerHTML = domaineHtml;
        sousDomaineSelect.innerHTML = sousDomaineHtml;
    }

    /**
     * Ajoute un module à la configuration
     */
    function addModule() {
        const moduleId = moduleSelect.value;
        if (!moduleId) {
            showToast("Veuillez sélectionner un module", 'error');
            return;
        }

        const module = availableModules.find(m => String(m.Id) === String(moduleId));
        if (!module) return;

        // Vérifier si le module n'est pas déjà ajouté (ou permettre plusieurs ?)
        // Dans le doute, on garde le blocage par ID pour le moment
        if (configuredModules.some(m => String(m.Id) === String(moduleId))) {
            showToast("Ce module est déjà ajouté", 'error');
            return;
        }

        // Ajouter le module avec une liste d'actions (commence avec une vide)
        const moduleConfig = {
            Id: module.Id,
            Name: module.Name,
            NombreParamsInput: module.NombreParamsInput,
            Parametres: module.Parametres || [], // Liste de toutes les actions possibles
            SelectedActions: [''] // Liste des actions choisies (un tableau maintenant)
        };

        configuredModules.push(moduleConfig);
        renderModules();
        moduleSelect.value = '';
    }

    /**
     * Supprime un module de la configuration
     */
    function removeModule(index) {
        configuredModules.splice(index, 1);
        renderModules();
    }

    /**
     * Affiche les modules configurés
     */
    function renderModules() {
        modulesContainer.innerHTML = '';

        if (configuredModules.length === 0) {
            modulesContainer.innerHTML = '<p class="slds-text-color_weak">Aucun module ajouté</p>';
            return;
        }

        configuredModules.forEach((module, index) => {
            const moduleCard = document.createElement('div');
            moduleCard.className = 'slds-box slds-m-bottom_small module-card';
            moduleCard.setAttribute('draggable', 'true');
            moduleCard.dataset.index = index;

            let actionsHTML = '';
            const allPossibleActions = module.Parametres || [];
            const canAddMore = (module.NombreParamsInput !== 1) && (module.SelectedActions.length < allPossibleActions.length);

            module.SelectedActions.forEach((currentAction, actionIndex) => {
                const otherSelectedActions = module.SelectedActions.filter((_, idx) => idx !== actionIndex);
                const availableOptions = allPossibleActions
                    .filter(act => {
                        const val = typeof act === 'object' ? act.value : act;
                        return !otherSelectedActions.includes(val) || val === currentAction;
                    })
                    .map(act => {
                        const val = typeof act === 'object' ? act.value : act;
                        const label = typeof act === 'object' ? act.label : act;
                        return `<option value="${val}" ${currentAction === val ? 'selected' : ''}>${label}</option>`;
                    })
                    .join('');

                actionsHTML += `
                    <div class="slds-grid slds-grid_vertical-align-center slds-m-top_x-small">
                        <div class="slds-col slds-grow">
                            <div class="slds-form-element">
                                <div class="slds-form-element__control">
                                    <div class="slds-select_container">
                                        <select class="slds-select module-action-select"
                                                data-module-index="${index}"
                                                data-action-index="${actionIndex}">
                                            <option value="">-- Sélectionner une action --</option>
                                            ${availableOptions}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ${module.SelectedActions.length > 1 ? `
                            <div class="slds-col slds-no-flex slds-m-left_x-small">
                                <button class="slds-button slds-button_icon slds-button_icon-border slds-button_icon-error"
                                        onclick="window.removeActionAt(${index}, ${actionIndex})"
                                        title="Retirer cette action">
                                    <span style="font-size: 1rem;">✖️</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            const addActionBtnHTML = canAddMore ? `
                <div class="slds-m-top_x-small slds-text-align_center">
                    <button class="slds-button slds-button_success"
                            onclick="window.addActionToModule(${index})">
                        ➕ Ajouter une action
                    </button>
                </div>
            ` : '';

            moduleCard.innerHTML = `
                <div class="slds-grid slds-grid_vertical-align-center">
                    <div class="slds-col slds-no-flex slds-m-right_small drag-handle" style="cursor: grab; color: #ccc;">
                        <span style="font-size: 1.2rem;">☰</span>
                    </div>
                    <div class="slds-col slds-grow">
                        <div class="slds-grid slds-grid_align-spread">
                            <h3 class="slds-text-heading_small">
                                <strong>${module.Name}</strong>
                            </h3>
                            <button class="slds-button slds-button_icon slds-button_icon-border"
                                    onclick="window.removeModuleAt(${index})"
                                    title="Supprimer ce module complet">
                                <span style="font-size: 1.2rem;">🗑️</span>
                            </button>
                        </div>
                        <div class="slds-p-left_small slds-border_left slds-m-top_x-small" style="border-left-width: 3px; border-left-color: #f3f3f3;">
                            ${actionsHTML}
                            ${addActionBtnHTML}
                        </div>
                    </div>
                </div>
            `;

            // Drag and Drop events
            moduleCard.addEventListener('dragstart', (e) => {
                draggedItemIndex = index;
                moduleCard.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });

            moduleCard.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                moduleCard.classList.add('drag-over');
            });

            moduleCard.addEventListener('dragleave', () => {
                moduleCard.classList.remove('drag-over');
            });

            moduleCard.addEventListener('drop', (e) => {
                e.preventDefault();
                moduleCard.classList.remove('drag-over');
                const targetIndex = index;

                if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
                    const itemToMove = configuredModules.splice(draggedItemIndex, 1)[0];
                    configuredModules.splice(targetIndex, 0, itemToMove);
                    renderModules();
                }
            });

            moduleCard.addEventListener('dragend', () => {
                moduleCard.style.opacity = '1';
                draggedItemIndex = null;
                // Nettoyer tous les états drag-over au cas où
                document.querySelectorAll('.module-card').forEach(card => card.classList.remove('drag-over'));
            });

            modulesContainer.appendChild(moduleCard);
        });

        // Ajouter les event listeners pour les selects d'action
        modulesContainer.querySelectorAll('.module-action-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const moduleIndex = parseInt(e.target.dataset.moduleIndex);
                const actionIndex = parseInt(e.target.dataset.actionIndex);
                configuredModules[moduleIndex].SelectedActions[actionIndex] = e.target.value;

                // Re-render pour mettre à jour les filtres des dropdowns si multiple
                if (configuredModules[moduleIndex].NombreParamsInput !== 1) {
                    renderModules();
                }
            });
        });
    }

    /**
     * Ajoute une ligne d'action à un module (si multi-actions autorisé)
     */
    window.addActionToModule = function (moduleIndex) {
        configuredModules[moduleIndex].SelectedActions.push('');
        renderModules();
    };

    /**
     * Retire une ligne d'action d'un module
     */
    window.removeActionAt = function (moduleIndex, actionIndex) {
        configuredModules[moduleIndex].SelectedActions.splice(actionIndex, 1);
        renderModules();
    };

    // Exposer removeModule globalement pour les boutons
    window.removeModuleAt = removeModule;


    /**
     * Charge la liste des DNIS depuis DynamoDB
     */
    async function loadDNISList() {
        try {
            dnisSelect.innerHTML = '<option value="">Chargement...</option>';

            const items = await window.dynamoDBService.scan(TABLE_NAME);

            const currentVal = dnisSelect.value;
            dnisSelect.innerHTML = '<option value="">Sélectionner un DNIS...</option>';

            if (items && items.length > 0) {
                // Trier par Dnis puis Marque
                items.sort((a, b) => {
                    const dnisCompare = (a.Dnis || '').localeCompare(b.Dnis || '');
                    if (dnisCompare !== 0) return dnisCompare;
                    return (a.Marque || '').localeCompare(b.Marque || '');
                });

                items.forEach(item => {
                    const option = document.createElement('option');
                    // Utiliser Dnis#Marque comme valeur unique
                    option.value = `${item.Dnis}#${item.Marque || ''}`;
                    const displayText = `${item.Dnis}${item.Nom ? ' - ' + item.Nom : ''}`;
                    option.textContent = displayText;
                    dnisSelect.appendChild(option);
                });

                if (currentVal) dnisSelect.value = currentVal;
            } else {
                dnisSelect.innerHTML = '<option value="">Aucun DNIS trouvé. Utilisez « Nouveau DNIS » pour en créer.</option>';
            }
        } catch (err) {
            console.error("Erreur lors du chargement des DNIS:", err);
            dnisSelect.innerHTML = '<option value="">Erreur chargement</option>';
        }
    }

    /**
     * Charge les détails d'un DNIS avec effet skeleton
     */
    async function loadDNISDetails(compositeKey) {
        const [dnis, marque] = compositeKey.split('#');

        // Afficher les skeletons
        showSkeletonDetails();
        editDnisContainer.classList.remove('slds-hide');
        dnisDetailsContainer.classList.remove('slds-hide');
        document.getElementById('detail-numero').innerHTML = '<div class="skeleton" style="width: 200px; height: 1.5em; display: inline-block;"></div>';

        try {
            const item = await window.dynamoDBService.get(TABLE_NAME, { 'Dnis': dnis, 'Marque': marque || '' });
            currentDNIS = item;

            if (currentDNIS) {
                displayDNISDetails(currentDNIS);
            }
        } catch (err) {
            // Erreur gérée par le service
            // Masquer les conteneurs si erreur
            editDnisContainer.classList.add('slds-hide');
            dnisDetailsContainer.classList.add('slds-hide');
        }
    }

    function showSkeletonDetails() {
        const detailsContent = document.getElementById('dnis-details-content');
        detailsContent.innerHTML = '';

        // Générer 8 blocs skeleton
        for (let i = 0; i < 8; i++) {
            const col = document.createElement('div');
            col.className = 'slds-col slds-size_1-of-2 slds-m-bottom_small';
            col.innerHTML = `
                <div class="slds-form-element">
                     <div class="skeleton skeleton-text" style="width: 30%"></div>
                     <div class="skeleton" style="height: 20px; width: 80%"></div>
                </div>
            `;
            detailsContent.appendChild(col);
        }
    }

    /**
     * Affiche les détails d'un DNIS
     */
    function displayDNISDetails(dnis) {
        document.getElementById('detail-numero').textContent = dnis.Dnis || '';

        const detailsContent = document.getElementById('dnis-details-content');
        detailsContent.innerHTML = '';

        const fields = [
            { label: 'DNIS', value: dnis.Dnis },
            { label: 'Nom', value: dnis.Nom },
            { label: 'Marque', value: dnis.Marque },
            { label: 'Ani Simulation', value: dnis.Ani_Simulation },
            { label: 'Date Simulation', value: dnis.Date_Simulation },
            { label: 'Domaine', value: dnis.Domaine },
            { label: 'Intention Déduite', value: dnis.IntentionDeduite },
            { label: 'Sous-domaine', value: dnis['Sous-domaine'] },
            { label: 'Voix Acteur', value: dnis.Voix_Acteur, isAdmin: true },
            { label: 'Logger Actif', value: dnis.Logger_Actif ? '✅ Oui' : '❌ Non', isAdmin: true },
            { label: 'Ani Simulation', value: dnis.Ani_Simulation, isAdmin: true },
            { label: 'Date Simulation', value: dnis.Date_Simulation, isAdmin: true }
        ];

        // Afficher les modules séparément s'ils existent
        let modulesDisplay = '';
        if (Array.isArray(dnis.Modules) && dnis.Modules.length > 0) {
            modulesDisplay = dnis.Modules.map(moduleStr => {
                if (typeof moduleStr !== 'string') return JSON.stringify(moduleStr);

                const parts = moduleStr.split(':');
                if (parts.length >= 3) {
                    const name = parts[1];
                    let action = parts.slice(2).join(':');

                    if (action.startsWith('[') && action.endsWith(']')) {
                        try {
                            const actions = JSON.parse(action.replace(/'/g, '"'));
                            action = actions.join(', ');
                        } catch (e) { }
                    }

                    return `${name} - <strong>${action}</strong>`;
                }
                return moduleStr;
            }).join('<br>');
            fields.push({ label: 'Modules', value: modulesDisplay });
        }

        fields.forEach(field => {
            if (field.value !== undefined && field.value !== null && field.value !== '') {
                const col = document.createElement('div');
                col.className = 'slds-col slds-size_1-of-2 slds-m-bottom_small';
                if (field.isAdmin) {
                    col.classList.add('admin-field');
                    if (!isAdminVisibleDetails) col.classList.add('slds-hide');
                }
                col.innerHTML = `
                    <div class="slds-form-element">
                        <span class="slds-form-element__label slds-text-title_bold">${field.label}</span>
                        <div class="slds-form-element__static">${field.value}</div>
                    </div>
                `;
                detailsContent.appendChild(col);
            }
        });
    }

    /**
     * Bascule l'affichage des champs Admin dans les détails
     */
    function toggleAdminFieldsDetails() {
        isAdminVisibleDetails = !isAdminVisibleDetails;
        const fields = document.querySelectorAll('#dnis-details-content .admin-field');
        fields.forEach(f => f.classList.toggle('slds-hide'));
        toggleAdminDetailsBtn.textContent = isAdminVisibleDetails ? '⚙️ Masquer les options Admin' : '⚙️ Afficher les options Admin';
    }

    /**
     * Bascule l'affichage des champs Admin dans l'éditeur
     */
    function toggleAdminFieldsEditor() {
        isAdminVisibleEditor = !isAdminVisibleEditor;
        const fields = document.querySelectorAll('#dnis-editor-modal .admin-field');
        fields.forEach(f => f.classList.toggle('slds-hide'));
        toggleAdminEditorBtn.textContent = isAdminVisibleEditor ? '⚙️ Masquer les options Admin' : '⚙️ Afficher les options Admin';
    }

    /**
     * Ouvre le modal d'édition
     */
    function openEditorModal(editMode = false) {
        isEditMode = editMode;

        const marqueSelectContainer = document.getElementById('marque-select-container');
        const marqueReadonlyInput = document.getElementById('editor-marque-readonly');
        const numeroInput = document.getElementById('editor-numero');
        const numeroReadonlyInput = document.getElementById('editor-numero-readonly');

        if (editMode && currentDNIS) {
            editorTitle.textContent = 'Éditer le DNIS : ' + currentDNIS.Dnis;
            populateEditorForm(currentDNIS);

            // Mode Edition : Cacher les champs éditables (clés), montrer les readonly
            if (numeroInput) numeroInput.classList.add('slds-hide');
            if (numeroReadonlyInput) numeroReadonlyInput.classList.remove('slds-hide');

            if (marqueSelectContainer) marqueSelectContainer.classList.add('slds-hide');
            if (marqueReadonlyInput) marqueReadonlyInput.classList.remove('slds-hide');
        } else {
            editorTitle.textContent = 'Nouveau DNIS';
            clearEditorForm();

            // Mode Création/Duplication : Montrer les champs éditables, cacher les readonly
            if (numeroInput) numeroInput.classList.remove('slds-hide');
            if (numeroReadonlyInput) numeroReadonlyInput.classList.add('slds-hide');

            if (marqueSelectContainer) marqueSelectContainer.classList.remove('slds-hide');
            if (marqueReadonlyInput) marqueReadonlyInput.classList.add('slds-hide');
        }

        // Reset admin visibility
        isAdminVisibleEditor = false;
        const adminFields = document.querySelectorAll('#dnis-editor-modal .admin-field');
        adminFields.forEach(f => f.classList.add('slds-hide'));
        if (toggleAdminEditorBtn) toggleAdminEditorBtn.textContent = '⚙️ Afficher les options Admin';

        // Reset errors
        document.querySelectorAll('.slds-has-error').forEach(el => el.classList.remove('slds-has-error'));

        editorModal.classList.add('slds-fade-in-open');
        editorBackdrop.classList.add('slds-backdrop_open');
        if (editorGuard) setTimeout(() => editorGuard.reset(), 0);
    }

    /**
     * Ferme le modal d'édition
     */
    function closeEditorModal() {
        editorModal.classList.remove('slds-fade-in-open');
        editorBackdrop.classList.remove('slds-backdrop_open');
        clearEditorForm();
    }

    /**
     * Remplit le formulaire avec les données d'un DNIS
     */
    function populateEditorForm(dnis) {
        document.getElementById('editor-numero').value = dnis.Dnis || '';
        document.getElementById('editor-numero-readonly').value = dnis.Dnis || '';
        document.getElementById('editor-nom').value = dnis.Nom || '';
        document.getElementById('editor-marque').value = dnis.Marque || '';
        document.getElementById('editor-marque-readonly').value = dnis.Marque || '';
        document.getElementById('editor-ani-simulation').value = dnis.Ani_Simulation || '';
        document.getElementById('editor-date-simulation').value = dnis.Date_Simulation || '';
        document.getElementById('editor-domaine').value = dnis.Domaine || '';
        document.getElementById('editor-intention-deduite').value = dnis.IntentionDeduite || '';
        document.getElementById('editor-sous-domaine').value = dnis['Sous-domaine'] || '';
        document.getElementById('editor-voix-acteur').value = dnis.Voix_Acteur || '';
        document.getElementById('editor-logger-actif').checked = dnis.Logger_Actif || false;

        // Charger les modules
        configuredModules = [];
        if (Array.isArray(dnis.Modules)) {
            dnis.Modules.forEach(moduleStr => {
                if (typeof moduleStr !== 'string') return;

                // Parser le format Module:Name:Action
                const parts = moduleStr.split(':');
                if (parts.length >= 3) {
                    const moduleName = parts[1];
                    let actionValue = parts.slice(2).join(':');

                    let selectedActions = [];
                    // Vérifier si c'est un tableau ['A','B']
                    if (actionValue.startsWith('[') && actionValue.endsWith(']')) {
                        try {
                            // Remplacer les quotes simples par doubles pour le parse JSON
                            selectedActions = JSON.parse(actionValue.replace(/'/g, '"'));
                        } catch (e) {
                            selectedActions = [actionValue];
                        }
                    } else {
                        selectedActions = [actionValue];
                    }

                    // Trouver le module dans la liste des modules disponibles pour récupérer les actions à jour (ex: Connect)
                    const moduleInfo = availableModules.find(m => (m.Name || '').trim() === moduleName);
                    if (moduleInfo) {
                        configuredModules.push({
                            Id: moduleInfo.Id,
                            Name: moduleInfo.Name,
                            NombreParamsInput: moduleInfo.NombreParamsInput,
                            Parametres: moduleInfo.Parametres || [], // Liste des actions à jour (Connect si mod_GuidesVocaux)
                            SelectedActions: selectedActions // Les actions sauvegardées
                        });
                    } else {
                        // Si le module n'est plus dans la table IHM, on le garde quand même pour l'affichage/édition
                        configuredModules.push({
                            Id: null,
                            Name: moduleName,
                            NombreParamsInput: 0,
                            Parametres: [],
                            SelectedActions: selectedActions
                        });
                    }
                }
            });
        }
        renderModules();
    }

    /**
     * Vide le formulaire
     */
    function clearEditorForm() {
        ['editor-numero', 'editor-numero-readonly', 'editor-nom', 'editor-marque', 'editor-marque-readonly', 'editor-ani-simulation',
            'editor-date-simulation', 'editor-domaine', 'editor-intention-deduite',
            'editor-sous-domaine',
            'editor-voix-acteur'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

        document.getElementById('editor-logger-actif').checked = true;
        document.getElementById('editor-voix-acteur').value = 'Lea';
        configuredModules = [];
        renderModules();
    }

    /**
     * Configure la validation en temps réel
     */
    function setupRealTimeValidation() {
        const validateField = (input, validator, errorMsg) => {
            const formElement = input.closest('.slds-form-element');
            const isValid = validator(input.value);

            if (!isValid) {
                formElement.classList.add('slds-has-error');
                // Check if error message exists
                if (!formElement.querySelector('.slds-form-element__help')) {
                    const help = document.createElement('div');
                    help.className = 'slds-form-element__help';
                    help.textContent = errorMsg;
                    formElement.appendChild(help);
                }
            } else {
                formElement.classList.remove('slds-has-error');
                const help = formElement.querySelector('.slds-form-element__help');
                if (help) help.remove();
            }
        };

        const dnisInput = document.getElementById('editor-numero');
        if (dnisInput) {
            dnisInput.addEventListener('input', () => {
                validateField(dnisInput,
                    (val) => !val || (window.validatePhoneNumber ? window.validatePhoneNumber(val) : true),
                    "Le format doit être international (+33...)"
                );
            });
        }

        const aniInput = document.getElementById('editor-ani-simulation');
        if (aniInput) {
            aniInput.addEventListener('input', () => {
                validateField(aniInput,
                    (val) => !val || (window.validatePhoneNumber ? window.validatePhoneNumber(val) : true),
                    "Le format doit être international (+33...)"
                );
            });
        }

        // Validation simple pour la marque (obligatoire)
        const marqueInput = document.getElementById('editor-marque');
        if (marqueInput) {
            marqueInput.addEventListener('input', () => {
                validateField(marqueInput, (val) => val.trim().length > 0, "Ce champ est obligatoire.");
            });
        }
    }

    /**
     * Sauvegarde un DNIS
     */
    async function saveDNIS() {
        const dnis = document.getElementById('editor-numero').value.trim();
        const marque = document.getElementById('editor-marque').value.trim();

        // Validation finale (revérifie tout)
        let hasError = false;

        if (!dnis) {
            showToast("Le numéro DNIS est obligatoire.", 'error'); hasError = true;
        } else if (window.validatePhoneNumber && !validatePhoneNumber(dnis)) {
            showToast("Le numéro doit être au format international (+33...)", 'error'); hasError = true;
        }

        if (!marque) {
            showToast("La marque est obligatoire.", 'error'); hasError = true;
        }

        const aniSimulation = document.getElementById('editor-ani-simulation').value.trim();
        if (aniSimulation && window.validatePhoneNumber && !validatePhoneNumber(aniSimulation)) {
            showToast("L'Ani Simulation doit être au format international (+33...)", 'error'); hasError = true;
        }

        if (hasError) return;

        // Préparer les données
        const dnisData = {
            Dnis: dnis,
            Marque: document.getElementById('editor-marque').value || undefined,
            Nom: document.getElementById('editor-nom').value.trim() || undefined,
            Ani_Simulation: aniSimulation || undefined,
            Date_Simulation: document.getElementById('editor-date-simulation').value || undefined,
            Domaine: document.getElementById('editor-domaine').value || undefined,
            IntentionDeduite: document.getElementById('editor-intention-deduite').value.trim() || undefined,
            'Sous-domaine': document.getElementById('editor-sous-domaine').value || undefined,
            Voix_Acteur: document.getElementById('editor-voix-acteur').value.trim() || undefined,
            Logger_Actif: document.getElementById('editor-logger-actif').checked
        };

        // Traiter les modules au format Module:Name:Action ou Module:Name:[...]
        if (configuredModules.length > 0) {
            dnisData.Modules = configuredModules.map(module => {
                const actions = module.SelectedActions.filter(a => a !== '');

                let actionStr = '';
                if (actions.length > 1 || (actions.length === 1 && module.NombreParamsInput !== 1)) {
                    // Format tableau si plusieurs actions OU si le module attend explicitement du multi
                    // Utiliser des quotes simples comme demandé dans l'exemple
                    actionStr = "[" + actions.map(a => `'${a}'`).join(',') + "]";
                } else if (actions.length === 1) {
                    actionStr = actions[0];
                }

                return `Module:${module.Name}:${actionStr}`;
            });
        }

        // Supprimer les champs undefined
        Object.keys(dnisData).forEach(key => {
            if (dnisData[key] === undefined) {
                delete dnisData[key];
            }
        });

        saveDnisBtn.disabled = true;
        saveDnisBtn.textContent = 'Sauvegarde...';

        try {
            await window.dynamoDBService.put(TABLE_NAME, dnisData);
            showToast("DNIS sauvegardé avec succès !", 'success');
            if (editorGuard) editorGuard.reset();
            closeEditorModal();
            await loadDNISList();

            // Sélectionner le DNIS sauvegardé
            const compositeKey = `${dnis}#${marque}`;
            dnisSelect.value = compositeKey;
            await loadDNISDetails(compositeKey);
        } catch (err) {
            // Erreur gérée par le service
        } finally {
            saveDnisBtn.disabled = false;
            saveDnisBtn.textContent = 'Sauvegarder';
        }
    }

    /**
     * Supprime un DNIS
     */
    async function deleteDNIS() {
        if (!currentDNIS) return;

        const dnis = currentDNIS.Dnis;
        const marque = currentDNIS.Marque;
        const nom = currentDNIS.Nom || dnis;

        showConfirmModal(
            "Suppression du DNIS",
            `Êtes-vous sûr de vouloir supprimer définitivement le DNIS "<strong>${nom}</strong>" (${dnis} - ${marque}) ?\nCette action est irréversible.`,
            async () => {
                deleteDnisBtn.disabled = true;
                deleteDnisBtn.textContent = '...';

                try {
                    await window.dynamoDBService.delete(TABLE_NAME, { 'Dnis': dnis, 'Marque': marque });
                    showToast("DNIS supprimé avec succès.", 'success');

                    currentDNIS = null;
                    editDnisContainer.classList.add('slds-hide');
                    dnisDetailsContainer.classList.add('slds-hide');

                    await loadDNISList();
                    dnisSelect.value = "";
                } catch (err) {
                    // Erreur gérée par service
                } finally {
                    deleteDnisBtn.disabled = false;
                    deleteDnisBtn.innerHTML = '<span class="slds-m-right_xx-small">🗑️</span> Supprimer';
                }
            }
        );
    }

    /**
     * Duplique un DNIS
     */
    function duplicateDNIS() {
        if (!currentDNIS) return;

        // Ouvrir en mode "Nouveau" pour tout réinitialiser
        openEditorModal(false);

        // Pré-remplir avec les données du DNIS courant
        populateEditorForm(currentDNIS);

        // Vider le champ Numéro car il doit être unique
        document.getElementById('editor-numero').value = '';

        // S'assurer que la Marque est modifiable
        document.getElementById('editor-marque').disabled = false;
        document.getElementById('editor-numero').disabled = false;

        // Changer le titre
        editorTitle.textContent = 'Nouveau DNIS (Copie)';
    }

    // Event Listeners
    if (dnisSelect) {
        dnisSelect.addEventListener('change', async () => {
            const compositeKey = dnisSelect.value;
            if (compositeKey) {
                await loadDNISDetails(compositeKey);
            } else {
                currentDNIS = null;
                editDnisContainer.classList.add('slds-hide');
                dnisDetailsContainer.classList.add('slds-hide');
            }
        });
    }

    if (newDnisBtn) newDnisBtn.addEventListener('click', () => openEditorModal(false));
    if (editDnisBtn) editDnisBtn.addEventListener('click', () => openEditorModal(true));
    if (duplicateDnisBtn) duplicateDnisBtn.addEventListener('click', duplicateDNIS);
    if (deleteDnisBtn) deleteDnisBtn.addEventListener('click', deleteDNIS);

    if (closeEditorBtn) closeEditorBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(closeEditorModal); else closeEditorModal();
    });
    if (cancelEditorBtn) cancelEditorBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(closeEditorModal); else closeEditorModal();
    });
    if (saveDnisBtn) saveDnisBtn.addEventListener('click', saveDNIS);

    if (toggleAdminDetailsBtn) toggleAdminDetailsBtn.addEventListener('click', toggleAdminFieldsDetails);
    if (toggleAdminEditorBtn) toggleAdminEditorBtn.addEventListener('click', toggleAdminFieldsEditor);

    // Module management event listeners
    if (addModuleBtn) addModuleBtn.addEventListener('click', addModule);

    // Initialisation séquentielle pour éviter les conditions de concurrence
    async function initialize() {
        try {
            // Charger d'abord les modules (car ils impactent l'affichage des DNIS existants)
            await loadAvailableModules();
            // Puis le reste
            await Promise.all([
                loadStructures(),
                loadDNISList()
            ]);
            setupRealTimeValidation();
            if (window.addSearchFilter) window.addSearchFilter(dnisSelect, 'Rechercher un DNIS...');
            console.log("DNIS Manager: Initialisation terminée.");
        } catch (err) {
            console.error("DNIS Manager: Erreur lors de l'initialisation:", err);
        }
    }

    initialize();
});
