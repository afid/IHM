/**
 * segments-manager.js
 *
 * GESTIONNAIRE DES SEGMENTS :
 * Ce fichier gère toutes les opérations CRUD (Create, Read, Update, Delete)
 * pour les paramètres des segments stockés dans DynamoDB.
 * Utilise window.dynamoDBService pour l'accès aux données.
 */

function initSegmentsManager() {
    console.log("segments-manager.js : Initialisation du gestionnaire...");
    const TABLE_NAME = 'Core_Ddb_CiblageParametrageSegments';
    const CALENDARS_TABLE = 'Core_Ddb_Calendriers';
    const CALENDAR_PREFIX = 'Cal_Distrib_';
    const MODULES_TABLE = 'Core_Ddb_IHM';

    // Éléments DOM
    const segmentSelect = document.getElementById('segment-select');
    const newSegmentBtn = document.getElementById('new-segment-btn');
    const editSegmentBtn = document.getElementById('edit-segment-btn');
    const duplicateSegmentBtn = document.getElementById('duplicate-segment-btn');
    const deleteSegmentBtn = document.getElementById('delete-segment-btn');
    const editSegmentContainer = document.getElementById('edit-segment-container');
    const segmentDetailsContainer = document.getElementById('segment-details-container');

    // Modal elements
    const editorModal = document.getElementById('segment-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const cancelEditorBtn = document.getElementById('cancel-editor-btn');
    const saveSegmentBtn = document.getElementById('save-segment-btn');

    //console.log("saveSegmentBtn found:", saveSegmentBtn);
    //if (!saveSegmentBtn) {
    //    console.warn("ATTENTION : save-segment-btn non trouvé dans le DOM !");
    //}

    const editorTitle = document.getElementById('editor-title');

    // Confirmation modal
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmBackdrop = document.getElementById('confirmation-backdrop');
    const closeConfirmBtn = document.getElementById('close-confirm-btn');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const okConfirmBtn = document.getElementById('ok-confirm-btn');
    const confirmTitle = document.getElementById('confirm-modal-title');
    const confirmMessage = document.getElementById('confirm-modal-message');

    // Calendriers elements
    const calendriersContainer = document.getElementById('calendriers-container');
    const addCalendrierBtn = document.getElementById('add-calendrier-btn');

    // Modules elements
    const preCiblageContainer = document.getElementById('pre-ciblage-container');
    const addPreModuleBtn = document.getElementById('add-pre-module-btn');
    const postCiblageContainer = document.getElementById('post-ciblage-container');
    const addPostModuleBtn = document.getElementById('add-post-module-btn');

    // Current state
    let currentSegment = null;
    let isEditMode = false;
    let confirmAction = null;
    let availableCalendars = [];
    let availableModules = [];
    let availableSituations = [];
    let availablePrompts = [];    // Prompts Amazon Connect (pour mod_GuidesVocaux)
    let draggedModuleRow = null;   // Pour le drag-and-drop des modules

    /**
     * Charge la liste des calendriers de distribution
     */
    async function loadDistributionCalendars() {
        try {
            const items = await window.dynamoDBService.scan(CALENDARS_TABLE);
            availableCalendars = [];

            if (items && items.length > 0) {
                // On garde tous les calendriers ayant un id_Calendar
                availableCalendars = items.filter(item => item.id_Calendar);

                // Tri alphabétique par Nom (ou ID si pas de nom)
                availableCalendars.sort((a, b) =>
                    (a.Nom || a.id_Calendar).localeCompare(b.Nom || b.id_Calendar)
                );
                console.log(`DynamoDB (${CALENDARS_TABLE}): ${availableCalendars.length} calendriers récupérés avec succès.`);
            }
        } catch (err) {
            console.error('Erreur lors du chargement des calendriers:', err);
            showToast("Erreur lors du chargement des calendriers", 'error');
        }
    }

    /**
     * Charge la liste des modules disponibles depuis Core_Ddb_IHM
     * et les prompts Amazon Connect pour mod_GuidesVocaux
     */
    async function loadAvailableModules() {
        try {
            const items = await window.dynamoDBService.scan(MODULES_TABLE);
            // Filtrer les modules (type 'Module')
            availableModules = (items || []).filter(item => item.Type === 'Module');
            availableModules.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

            // Filtrer les situations (type 'Situation')
            availableSituations = (items || []).filter(item => item.Type === 'Situation');
            availableSituations.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

            // Charger les prompts Amazon Connect si le service est disponible
            if (window.connectService) {
                try {
                    availablePrompts = (await window.connectService.listAllPrompts() || []).sort();
                    console.log(`Segments: ${availablePrompts.length} prompts Amazon Connect chargés.`);
                } catch (err) {
                    console.error('Segments: Erreur chargement prompts Connect:', err);
                }
            }
        } catch (err) {
            console.error('Erreur lors du chargement des ressources:', err);
        }
    }

    /**
     * Met à jour le contrôle de paramètre selon le module sélectionné :
     * - mod_Calendrier  → select des calendriers DynamoDB
     * - mod_GuidesVocaux → select des prompts Amazon Connect
     * - autre            → champ texte libre
     */
    function updateParamControl(paramsCol, moduleName, existingValue) {
        paramsCol.innerHTML = '';
        
        const moduleInfo = availableModules.find(m => m.Name === moduleName);
        const maxParams = moduleInfo ? moduleInfo.NombreParamsInput : 1;

        let selectedActions = [];
        if (existingValue && existingValue.startsWith('[') && existingValue.endsWith(']')) {
            try {
                selectedActions = JSON.parse(existingValue.replace(/'/g, '"'));
            } catch (e) {
                selectedActions = [existingValue];
            }
        } else if (existingValue) {
            selectedActions = [existingValue];
        }

        if (selectedActions.length === 0) {
            selectedActions = [''];
        }

        const isCalendar = moduleName && moduleName.includes('mod_Calendrier');
        const isGuides = moduleName && moduleName.includes('mod_GuidesVocaux');

        const inputsContainer = document.createElement('div');
        inputsContainer.className = 'params-inputs-container';
        paramsCol.appendChild(inputsContainer);

        const renderInputs = () => {
            inputsContainer.innerHTML = '';

            selectedActions.forEach((val, index) => {
                const actionRow = document.createElement('div');
                actionRow.className = 'slds-grid slds-m-bottom_x-small slds-grid_vertical-align-center';

                const inputCol = document.createElement('div');
                inputCol.className = 'slds-col slds-grow';

                let inputEl;
                if (isCalendar || isGuides) {
                    inputEl = document.createElement('select');
                    inputEl.className = 'slds-select module-params-input';

                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = '';
                    emptyOpt.textContent = isCalendar ? '-- Sélectionner un calendrier --' : (availablePrompts.length > 0 ? '-- Sélectionner un guide vocal --' : 'Chargement...');
                    inputEl.appendChild(emptyOpt);

                    if (isCalendar) {
                        availableCalendars.forEach(cal => {
                            const opt = document.createElement('option');
                            opt.value = cal.id_Calendar;
                            opt.textContent = cal.Nom || cal.id_Calendar;
                            if (cal.id_Calendar === val || cal.Nom === val) opt.selected = true;
                            inputEl.appendChild(opt);
                        });
                    } else if (isGuides) {
                        availablePrompts.forEach(prompt => {
                            const opt = document.createElement('option');
                            opt.value = prompt;
                            opt.textContent = prompt;
                            if (prompt === val) opt.selected = true;
                            inputEl.appendChild(opt);
                        });
                    }
                } else {
                    inputEl = document.createElement('input');
                    inputEl.type = 'text';
                    inputEl.className = 'slds-input module-params-input';
                    inputEl.placeholder = "Paramètre...";
                    inputEl.value = val || '';
                }

                inputEl.addEventListener('change', (e) => {
                    selectedActions[index] = e.target.value;
                });

                inputCol.appendChild(inputEl);
                actionRow.appendChild(inputCol);

                if (selectedActions.length > 1) {
                    const delCol = document.createElement('div');
                    delCol.className = 'slds-col slds-no-flex slds-m-left_x-small';
                    const delBtn = document.createElement('button');
                    // Style copié depuis paramétrage_dnis pour la croix de suppression
                    delBtn.className = 'slds-button slds-button_icon slds-button_icon-border slds-button_icon-error';
                    delBtn.title = 'Retirer cette action';
                    delBtn.innerHTML = '<span style="font-size: 1rem;">✖️</span>';
                    delBtn.onclick = () => {
                        selectedActions.splice(index, 1);
                        renderInputs();
                    };
                    delCol.appendChild(delBtn);
                    actionRow.appendChild(delCol);
                }

                inputsContainer.appendChild(actionRow);
            });

            // NombreParamsInput: 0 signifie infini, sinon limite stricte
            const canAddMore = (maxParams === 0) || (selectedActions.length < maxParams);

            if (canAddMore) {
                const addDiv = document.createElement('div');
                addDiv.className = 'slds-m-top_x-small slds-text-align_right';
                const addBtn = document.createElement('button');
                addBtn.className = 'slds-button slds-button_neutral slds-button_small';
                addBtn.innerHTML = '➕ Ajouter un paramètre';
                addBtn.onclick = () => {
                    selectedActions.push('');
                    renderInputs();
                };
                addDiv.appendChild(addBtn);
                inputsContainer.appendChild(addDiv);
            }
        };

        renderInputs();
    }


    /**
     * Crée un select rempli avec les modules disponibles
     */
    function createModuleSelect(selectedValue = '') {
        const select = document.createElement('select');
        select.className = 'slds-select module-name-select';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Sélectionner un module --';
        select.appendChild(emptyOption);

        availableModules.forEach(module => {
            const option = document.createElement('option');
            option.value = module.Name;
            option.textContent = module.Name;
            if (module.Name === selectedValue) option.selected = true;
            select.appendChild(option);
        });

        return select;
    }

    /**
     * Ajoute une nouvelle ligne de module (Pre ou Post) avec support drag-and-drop
     * et paramètre contextuel (calendrier, guide vocal, ou texte libre)
     */
    function addModuleRow(container, moduleName = '', params = '') {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'module-row slds-grid slds-gutters_small slds-m-bottom_small';
        rowDiv.setAttribute('draggable', 'true');

        // Poignée de drag
        const dragCol = document.createElement('div');
        dragCol.className = 'slds-col slds-no-flex slds-grid slds-grid_vertical-align-center';
        dragCol.innerHTML = '<span class="drag-handle" title="Glisser pour réordonner">☰</span>';
        dragCol.style.cursor = 'grab';
        dragCol.style.color = '#ccc';
        dragCol.style.paddingRight = '4px';

        // Select pour le nom du module
        const nameCol = document.createElement('div');
        nameCol.className = 'slds-col slds-size_1-of-2';
        const moduleSelectEl = createModuleSelect(moduleName);
        nameCol.appendChild(moduleSelectEl);

        // Colonne des paramètres (contenu dynamique selon le module)
        const paramsCol = document.createElement('div');
        paramsCol.className = 'slds-col slds-grow';

        // Bouton supprimer
        const deleteCol = document.createElement('div');
        deleteCol.className = 'slds-col slds-grow-none';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'slds-button slds-button_destructive';
        deleteBtn.type = 'button';
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', () => rowDiv.remove());
        deleteCol.appendChild(deleteBtn);

        rowDiv.appendChild(dragCol);
        rowDiv.appendChild(nameCol);
        rowDiv.appendChild(paramsCol);
        rowDiv.appendChild(deleteCol);

        // Initialiser le bon contrôle selon le module déjà sélectionné
        updateParamControl(paramsCol, moduleName, params);

        // Mettre à jour le contrôle quand l'utilisateur change de module
        moduleSelectEl.addEventListener('change', () => {
            updateParamControl(paramsCol, moduleSelectEl.value, '');
        });

        // ―― Événements Drag & Drop ――
        rowDiv.addEventListener('dragstart', (e) => {
            draggedModuleRow = rowDiv;
            rowDiv.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
        });

        rowDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedModuleRow && draggedModuleRow !== rowDiv) {
                rowDiv.classList.add('drag-over');
            }
        });

        rowDiv.addEventListener('dragleave', () => {
            rowDiv.classList.remove('drag-over');
        });

        rowDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            rowDiv.classList.remove('drag-over');
            if (draggedModuleRow && draggedModuleRow !== rowDiv && container.contains(draggedModuleRow)) {
                // Insérer avant ou après selon la position verticale
                const rect = rowDiv.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(draggedModuleRow, rowDiv);
                } else {
                    container.insertBefore(draggedModuleRow, rowDiv.nextSibling);
                }
            }
        });

        rowDiv.addEventListener('dragend', () => {
            rowDiv.style.opacity = '1';
            draggedModuleRow = null;
            container.querySelectorAll('.module-row').forEach(r => r.classList.remove('drag-over'));
        });

        container.appendChild(rowDiv);
    }

    /**
     * Trouve le id_Calendar par le nom du calendrier
     */
    function findCalendarIdByName(calendarName) {
        if (!calendarName) return '';

        // Recherche exacte sur Nom ou ID
        const calendar = availableCalendars.find(cal =>
            cal.Nom === calendarName || cal.id_Calendar === calendarName
        );

        return calendar ? calendar.id_Calendar : '';
    }

    /**
     * Crée un select rempli avec les calendriers disponibles
     */
    function createCalendarSelect(selectedValue = '') {
        const select = document.createElement('select');
        select.className = 'slds-select calendar-select';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Sélectionner un calendrier --';
        select.appendChild(emptyOption);

        // Si selectedValue n'est pas déjà un id_Calendar, essayer de le trouver par le nom
        let targetId = selectedValue;
        if (selectedValue && !availableCalendars.some(c => c.id_Calendar === selectedValue)) {
            targetId = findCalendarIdByName(selectedValue);
        }

        availableCalendars.forEach(calendar => {
            const option = document.createElement('option');
            option.value = calendar.id_Calendar;
            option.textContent = calendar.Nom || calendar.id_Calendar;
            if (calendar.id_Calendar === targetId) option.selected = true;
            select.appendChild(option);
        });

        return select;
    }

    /**
     * Crée un select rempli avec les situations disponibles
     */
    function createSituationSelect(selectedValue = '') {
        const select = document.createElement('select');
        select.className = 'slds-select situation-select';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Sélectionner une situation --';
        select.appendChild(emptyOption);

        // Ajout de l'option "NORMALE" en haut de la liste (après le placeholder)
        const normaleOption = document.createElement('option');
        normaleOption.value = 'NORMALE';
        normaleOption.textContent = 'NORMALE';
        if (selectedValue === 'NORMALE') normaleOption.selected = true;
        select.appendChild(normaleOption);

        availableSituations.forEach(sit => {
            // Éviter de rajouter "NORMALE" si elle est déjà présente dans availableSituations
            if (sit.Name === 'NORMALE') return;

            const option = document.createElement('option');
            option.value = sit.Name;
            option.textContent = sit.Name;
            if (sit.Name === selectedValue) option.selected = true;
            select.appendChild(option);
        });

        return select;
    }

    /**
     * Ajoute une nouvelle ligne événement/calendrier
     */
    function addCalendrierRow(eventName = '', calendarValue = '') {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'calendrier-row slds-grid slds-gutters_small slds-m-bottom_small slds-grid_vertical-align-end';

        // Info: L'utilisateur souhaite ajouter des labels explicités
        // Input pour l'événement (Situation)
        const eventCol = document.createElement('div');
        eventCol.className = 'slds-col slds-grow';

        const eventFormEl = document.createElement('div');
        eventFormEl.className = 'slds-form-element';
        const eventLabel = document.createElement('label');
        eventLabel.className = 'slds-form-element__label';
        eventLabel.textContent = 'Situation';
        const eventControl = document.createElement('div');
        eventControl.className = 'slds-form-element__control';

        const eventSelect = createSituationSelect(eventName);
        eventControl.appendChild(eventSelect);

        eventFormEl.appendChild(eventLabel);
        eventFormEl.appendChild(eventControl);
        eventCol.appendChild(eventFormEl);

        // Select pour le calendrier
        const calendarCol = document.createElement('div');
        calendarCol.className = 'slds-col slds-grow';

        const calendarFormEl = document.createElement('div');
        calendarFormEl.className = 'slds-form-element';
        const calendarLabel = document.createElement('label');
        calendarLabel.className = 'slds-form-element__label';
        calendarLabel.textContent = 'Calendrier';
        const calendarControl = document.createElement('div');
        calendarControl.className = 'slds-form-element__control';

        const calendarSelect = createCalendarSelect(calendarValue);

        calendarControl.appendChild(calendarSelect);
        calendarFormEl.appendChild(calendarLabel);
        calendarFormEl.appendChild(calendarControl);
        calendarCol.appendChild(calendarFormEl);

        // Bouton supprimer
        const deleteCol = document.createElement('div');
        deleteCol.className = 'slds-col slds-grow-none';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'slds-button slds-button_destructive';
        deleteBtn.type = 'button';
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', () => rowDiv.remove());
        deleteCol.appendChild(deleteBtn);

        rowDiv.appendChild(eventCol);
        rowDiv.appendChild(calendarCol);
        rowDiv.appendChild(deleteCol);

        calendriersContainer.appendChild(rowDiv);
    }

    /**
     * Trouve le nom du calendrier par son id_Calendar
     */
    function getCalendarNameById(calendarId) {
        const calendar = availableCalendars.find(cal => cal.id_Calendar === calendarId);
        return calendar ? (calendar.Nom || calendar.id_Calendar) : calendarId;
    }

    /**
     * Récupère les paires événement/calendrier depuis les inputs
     */
    function getCalendriersFromForm() {
        const calendriers = {};
        const rows = calendriersContainer.querySelectorAll('.calendrier-row');

        rows.forEach(row => {
            const situationSelect = row.querySelector('.situation-select');
            const calendarSelect = row.querySelector('.calendar-select');

            if (situationSelect && calendarSelect) {
                const eventName = situationSelect.value;
                const calendarId = calendarSelect.value; // Récupère le .value du select (id_Calendar)

                if (eventName && calendarId) {
                    calendriers[eventName] = calendarId;
                }
            }
        });

        return calendriers;
    }

    /**
     * Charge la liste des segments depuis DynamoDB
     */
    async function loadSegmentsList() {
        try {
            segmentSelect.innerHTML = '<option value="">Chargement...</option>';
            const items = await window.dynamoDBService.scan(TABLE_NAME);

            segmentSelect.innerHTML = '<option value="">-- Sélectionner un segment --</option>';

            if (items && items.length > 0) {
                items.sort((a, b) => (a.Segment || '').localeCompare(b.Segment || ''));
                items.forEach(segment => {
                    const option = document.createElement('option');
                    option.value = segment.Segment;
                    option.textContent = segment.Segment;
                    segmentSelect.appendChild(option);
                });
            } else {
                segmentSelect.innerHTML = '<option value="">Aucun segment trouvé. Utilisez « Nouveau Segment » pour en créer.</option>';
            }
        } catch (err) {
            segmentSelect.innerHTML = '<option value="">Erreur lors du chargement</option>';
            showToast("Erreur lors du chargement des segments", 'error');
        }
    }

    /**
     * Parse une chaîne module "Module:Name:Params"
     */
    function parseModuleString(moduleStr) {
        if (!moduleStr || typeof moduleStr !== 'string') return null;
        const parts = moduleStr.split(':');
        if (parts.length >= 3) {
            return {
                name: parts[1],
                params: parts.slice(2).join(':')
            };
        }
        return null;
    }

    /**
     * Charge et affiche les détails du segment sélectionné
     */
    async function loadSegmentDetails() {
        const segmentName = segmentSelect.value;

        if (!segmentName) {
            segmentDetailsContainer.classList.add('slds-hide');
            editSegmentContainer.classList.add('slds-hide');
            return;
        }

        try {
            const segment = await window.dynamoDBService.get(TABLE_NAME, { Segment: segmentName });

            if (!segment) {
                showToast("Segment non trouvé", 'error');
                return;
            }

            currentSegment = segment;
            displaySegmentDetails(segment);
            editSegmentContainer.classList.remove('slds-hide');
            segmentDetailsContainer.classList.remove('slds-hide');
        } catch (err) {
            showToast("Erreur lors de la récupération du segment", 'error');
        }
    }

    /**
     * Affiche les détails du segment dans la card
     */
    function displaySegmentDetails(segment) {
        const detailsContent = document.getElementById('segment-details-content');
        const isEmergencyClosed = (segment.Etat === "Fermerture d'urgence" || segment.Etat === "FermetureUrgence");
        const statusBadge = isEmergencyClosed ?
            `<span class="slds-badge slds-theme_error slds-m-left_small">🚨 FERMETURE D'URGENCE</span>` : '';

        document.getElementById('detail-segment-name').innerHTML = `${segment.Segment} ${statusBadge}`;

        const fields = [
            { label: 'Nom du Segment', key: 'Segment', value: segment.Segment },
            { label: 'Groupement', key: 'Groupement', value: segment.Groupement || '(non défini)' },
            { label: 'Type', key: 'Type', value: segment.Type || 'Segment' }
        ];

        // On n'affiche le champ "État" que s'il n'y a pas de fermeture d'urgence (pour éviter la redondance avec le badge)
        if (!isEmergencyClosed) {
            fields.splice(2, 0, { label: 'État', key: 'Etat', value: segment.Etat || '(non défini)' });
        }

        let html = '';
        fields.forEach(field => {
            html += `
                <div class="slds-col slds-size_1-of-2">
                    <div class="slds-form-element">
                        <span class="slds-form-element__label slds-text-title_bold">${field.label}</span>
                        <div class="slds-form-element__static">
                            <div>${field.value}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        // Calendriers
        if (segment.Calendriers && Object.keys(segment.Calendriers).length > 0) {
            let calendriersHtml = '<table class="slds-table slds-table_bordered"><thead><tr><th>Événement</th><th>Calendrier</th></tr></thead><tbody>';
            Object.entries(segment.Calendriers).forEach(([eventName, calendarId]) => {
                const calendarName = getCalendarNameById(calendarId);
                calendriersHtml += `<tr><td>${eventName}</td><td>${calendarName}</td></tr>`;
            });
            calendriersHtml += '</tbody></table>';

            html += `
                <div class="slds-col slds-size_1-of-1">
                    <div class="slds-form-element slds-m-top_small">
                        <label class="slds-form-element__label slds-text-title_bold">Calendriers</label>
                        <div class="slds-form-element__static">
                            ${calendriersHtml}
                        </div>
                    </div>
                </div >
                `;
        }

        // Modules Pre Ciblage
        if (Array.isArray(segment.ModulesPreCiblage) && segment.ModulesPreCiblage.length > 0) {
            let preHtml = '<ul class="slds-list_dotted">';
            segment.ModulesPreCiblage.forEach(m => preHtml += `<li>${m}</li>`);
            preHtml += '</ul>';

            html += `
                <div class="slds-col slds-size_1-of-1">
                    <div class="slds-form-element slds-m-top_small">
                        <label class="slds-form-element__label slds-text-title_bold">Modules Pre Ciblage</label>
                        <div class="slds-form-element__static">
                            ${preHtml}
                        </div>
                    </div>
                </div >
                `;
        }

        // Modules Post Ciblage
        if (Array.isArray(segment.ModulesPostCiblage) && segment.ModulesPostCiblage.length > 0) {
            let postHtml = '<ul class="slds-list_dotted">';
            segment.ModulesPostCiblage.forEach(m => postHtml += `<li>${m}</li>`);
            postHtml += '</ul>';

            html += `
                <div class="slds-col slds-size_1-of-1">
                    <div class="slds-form-element slds-m-top_small">
                        <label class="slds-form-element__label slds-text-title_bold">Modules Post Ciblage</label>
                        <div class="slds-form-element__static">
                            ${postHtml}
                        </div>
                    </div>
                </div >
                `;
        }

        detailsContent.innerHTML = html;
    }

    /**
     * Ouvre la modale d'édition pour créer un nouveau segment
     */
    function openNewSegmentModal() {
        isEditMode = false;
        currentSegment = null;
        editorTitle.textContent = 'Nouveau Segment';

        document.getElementById('editor-segment-name').value = '';
        document.getElementById('editor-groupement').value = '';
        document.getElementById('editor-etat-toggle').checked = false;
        document.getElementById('editor-type').value = 'Segment';
        document.getElementById('editor-segment-name').removeAttribute('readonly');
        document.getElementById('editor-type').removeAttribute('disabled');

        // Vider le conteneur des calendriers et ajouter une ligne vide
        calendriersContainer.innerHTML = '';
        addCalendrierRow();

        // Vider les conteneurs de modules
        preCiblageContainer.innerHTML = '';
        postCiblageContainer.innerHTML = '';

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Ouvre la modale d'édition pour modifier un segment existant
     */
    function openEditSegmentModal() {
        if (!currentSegment) {
            console.error('Aucun segment sélectionné');
            return;
        }

        isEditMode = true;
        editorTitle.textContent = `Éditer le Segment: ${currentSegment.Segment} `;

        document.getElementById('editor-segment-name').value = currentSegment.Segment;
        document.getElementById('editor-groupement').value = currentSegment.Groupement || '';
        document.getElementById('editor-etat-toggle').checked = (currentSegment.Etat === "Fermerture d'urgence" || currentSegment.Etat === "FermetureUrgence");
        document.getElementById('editor-type').value = currentSegment.Type || 'Segment';
        document.getElementById('editor-segment-name').setAttribute('readonly', true);
        document.getElementById('editor-type').removeAttribute('disabled');

        // Charger les paires événement/calendrier existantes
        calendriersContainer.innerHTML = '';
        if (currentSegment.Calendriers && Object.keys(currentSegment.Calendriers).length > 0) {
            Object.entries(currentSegment.Calendriers).forEach(([eventName, calendarId]) => {
                addCalendrierRow(eventName, calendarId);
            });
        } else {
            addCalendrierRow();
        }

        // Charger les modules Pre Ciblage
        preCiblageContainer.innerHTML = '';
        if (Array.isArray(currentSegment.ModulesPreCiblage)) {
            currentSegment.ModulesPreCiblage.forEach(mStr => {
                const parsed = parseModuleString(mStr);
                if (parsed) addModuleRow(preCiblageContainer, parsed.name, parsed.params);
            });
        }

        // Charger les modules Post Ciblage
        postCiblageContainer.innerHTML = '';
        if (Array.isArray(currentSegment.ModulesPostCiblage)) {
            currentSegment.ModulesPostCiblage.forEach(mStr => {
                const parsed = parseModuleString(mStr);
                if (parsed) addModuleRow(postCiblageContainer, parsed.name, parsed.params);
            });
        }

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Duplique le segment actuel
     */
    function duplicateCurrentSegment() {
        if (!currentSegment) {
            console.error('Aucun segment à dupliquer');
            return;
        }

        isEditMode = false;
        editorTitle.textContent = 'Dupliquer le Segment';

        document.getElementById('editor-segment-name').value = `${currentSegment.Segment} _COPY`;
        document.getElementById('editor-groupement').value = currentSegment.Groupement || '';
        document.getElementById('editor-etat-toggle').checked = (currentSegment.Etat === "Fermerture d'urgence" || currentSegment.Etat === "FermetureUrgence");
        document.getElementById('editor-type').value = currentSegment.Type || 'Segment';
        document.getElementById('editor-segment-name').removeAttribute('readonly');
        document.getElementById('editor-type').removeAttribute('disabled');

        // Charger les mêmes paires événement/calendrier que le segment source
        calendriersContainer.innerHTML = '';
        if (currentSegment.Calendriers && Object.keys(currentSegment.Calendriers).length > 0) {
            Object.entries(currentSegment.Calendriers).forEach(([eventName, calendarId]) => {
                addCalendrierRow(eventName, calendarId);
            });
        } else {
            addCalendrierRow();
        }

        // Charger les mêmes modules Pre Ciblage
        preCiblageContainer.innerHTML = '';
        if (Array.isArray(currentSegment.ModulesPreCiblage)) {
            currentSegment.ModulesPreCiblage.forEach(mStr => {
                const parsed = parseModuleString(mStr);
                if (parsed) addModuleRow(preCiblageContainer, parsed.name, parsed.params);
            });
        }

        // Charger les mêmes modules Post Ciblage
        postCiblageContainer.innerHTML = '';
        if (Array.isArray(currentSegment.ModulesPostCiblage)) {
            currentSegment.ModulesPostCiblage.forEach(mStr => {
                const parsed = parseModuleString(mStr);
                if (parsed) addModuleRow(postCiblageContainer, parsed.name, parsed.params);
            });
        }

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Demande la confirmation avant suppression
     */
    function confirmDelete() {
        if (!currentSegment) return;

        confirmTitle.textContent = 'Supprimer le Segment';
        confirmMessage.textContent = `Êtes - vous sûr de vouloir supprimer le segment "${currentSegment.Segment}" ? Cette action ne peut pas être annulée.`;
        confirmAction = 'delete';

        showModal(confirmationModal, confirmBackdrop);
    }

    /**
     * Sauvegarde le segment (créer ou mettre à jour)
     */
    async function saveSegment() {
        console.log("Appel de saveSegment...");
        const segmentName = document.getElementById('editor-segment-name').value.trim();
        const groupement = document.getElementById('editor-groupement').value.trim();
        const isEmergencyClosed = document.getElementById('editor-etat-toggle').checked;
        const type = document.getElementById('editor-type').value.trim();

        // Validation
        if (!segmentName) {
            showToast("Le nom du segment est obligatoire", 'error');
            return;
        }

        if (!type) {
            showToast("Le type est obligatoire", 'error');
            return;
        }

        // Récupérer les paires événement/calendrier
        const calendriers = getCalendriersFromForm();

        const segmentData = {
            Segment: segmentName,
            Groupement: groupement,
            Type: type
        };

        if (isEmergencyClosed) {
            segmentData.Etat = "FermetureUrgence";
        }

        // Helper global pour agréger les modules selon les mêmes règles que DNISManager
        const extractModules = (container) => {
            const modules = [];
            container.querySelectorAll('.module-row').forEach(row => {
                const name = row.querySelector('.module-name-select').value;
                if (!name) return;

                const moduleInfo = availableModules.find(m => m.Name === name);
                const maxParams = moduleInfo ? moduleInfo.NombreParamsInput : 1;

                const inputs = Array.from(row.querySelectorAll('.module-params-input'));
                const actions = inputs.map(input => input.value.trim()).filter(val => val !== '');

                let actionStr = '';
                if (actions.length > 1 || (actions.length === 1 && maxParams !== 1)) {
                    // Toujours formater en tableau JSON-like avec simple quotes s'il y a plusieurs actions ou si c'est explicitement multi
                    actionStr = "[" + actions.map(a => `'${a}'`).join(',') + "]";
                } else if (actions.length === 1) {
                    actionStr = actions[0];
                } else {
                    actionStr = '[]';
                }

                modules.push(`Module:${name}:${actionStr}`);
            });
            return modules;
        };

        // Récupérer les modules Pre Ciblage
        const preModules = extractModules(preCiblageContainer);
        if (preModules.length > 0) segmentData.ModulesPreCiblage = preModules;

        // Récupérer les modules Post Ciblage
        const postModules = extractModules(postCiblageContainer);
        if (postModules.length > 0) segmentData.ModulesPostCiblage = postModules;

        if (Object.keys(calendriers).length > 0) segmentData.Calendriers = calendriers;

        // Log de débogage pour contrôler les données envoyées à DynamoDB
        console.log("Données du segment prêtes à être sauvegardées :", segmentData);

        try {
            await window.dynamoDBService.put(TABLE_NAME, segmentData);
            showToast("Segment sauvegardé avec succès", 'success');
            hideModal(editorModal, editorBackdrop);
            await loadSegmentsList();
            segmentSelect.value = segmentName;
            await loadSegmentDetails();
        } catch (err) {
            showToast("Erreur lors de la sauvegarde du segment", 'error');
        }
    }

    /**
     * Supprime le segment actuel
     */
    async function deleteCurrentSegment() {
        if (!currentSegment) return;

        try {
            await window.dynamoDBService.delete(TABLE_NAME, { Segment: currentSegment.Segment });
            showToast("Segment supprimé avec succès", 'success');
            currentSegment = null;
            segmentSelect.value = '';
            segmentDetailsContainer.classList.add('slds-hide');
            editSegmentContainer.classList.add('slds-hide');
            await loadSegmentsList();
        } catch (err) {
            showToast("Erreur lors de la suppression du segment", 'error');
        }
    }

    /**
     * Affiche une modale
     */
    function showModal(modal, backdrop) {
        if (!modal || !backdrop) {
            console.error('Éléments modale ou backdrop manquants');
            return;
        }
        modal.classList.remove('slds-hide');
        modal.classList.add('slds-fade-in-open');
        backdrop.classList.remove('slds-hide');
        backdrop.classList.add('slds-backdrop_open');
    }

    /**
     * Masque une modale
     */
    function hideModal(modal, backdrop) {
        if (!modal || !backdrop) return;
        modal.classList.remove('slds-fade-in-open');
        modal.classList.add('slds-hide');
        backdrop.classList.remove('slds-backdrop_open');
        backdrop.classList.add('slds-hide');
    }

    /**
     * Affiche une notification toast
     */
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // Vérifier que tous les éléments DOM existent

    // Event Listeners
    segmentSelect.addEventListener('change', () => {
        loadSegmentDetails();
    });

    newSegmentBtn.addEventListener('click', () => {
        openNewSegmentModal();
    });

    editSegmentBtn.addEventListener('click', () => {
        openEditSegmentModal();
    });

    duplicateSegmentBtn.addEventListener('click', () => {
        duplicateCurrentSegment();
    });

    deleteSegmentBtn.addEventListener('click', () => {
        confirmDelete();
    });

    addCalendrierBtn.addEventListener('click', () => {
        addCalendrierRow();
    });

    addPreModuleBtn.addEventListener('click', () => {
        addModuleRow(preCiblageContainer);
    });

    addPostModuleBtn.addEventListener('click', () => {
        addModuleRow(postCiblageContainer);
    });

    // Modal controls
    closeEditorBtn.addEventListener('click', () => {
        hideModal(editorModal, editorBackdrop);
    });
    cancelEditorBtn.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    saveSegmentBtn.addEventListener('click', () => {
        console.log("Clic détecté sur le bouton Sauvegarder");
        saveSegment();
    });

    closeConfirmBtn.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));
    cancelConfirmBtn.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));
    okConfirmBtn.addEventListener('click', async () => {
        hideModal(confirmationModal, confirmBackdrop);
        if (confirmAction === 'delete') {
            await deleteCurrentSegment();
        }
    });

    // Backdrop clicks
    editorBackdrop.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    confirmBackdrop.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));

    // Load initial data
    loadDistributionCalendars();
    loadAvailableModules(); // Ajouté
    loadSegmentsList();
    if (window.addSearchFilter) window.addSearchFilter(segmentSelect, 'Rechercher un segment...');
}

// Initialisation fiable : s'exécute même si le DOM est déjà chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSegmentsManager);
} else {
    initSegmentsManager();
}
