/**
 * parcours-manager.js
 *
 * GESTIONNAIRE DES PARCOURS :
 * Ce fichier gère toutes les opérations CRUD (Create, Read, Update, Delete)
 * pour les paramètres des parcours stockés dans DynamoDB.
 * Utilise window.dynamoDBService pour l'accès aux données.
 * Table : Core_Ddb_CiblageParametrageParcours
 * Guides vocaux : shared-core-euc1-flux-mod_GuidesVocaux (filtrage _DIS_, _ATT_, _MER_)
 */

document.addEventListener('DOMContentLoaded', () => {
    const TABLE_NAME = 'Core_Ddb_CiblageParametrageParcours';
    const IHM_TABLE = 'Core_Ddb_IHM';
    const GUIDES_MODULE_NAME = 'shared-core-euc1-flux-mod_GuidesVocaux';
    const ACTIONS_TABLE = 'Core_Ddb_EnchainementParametrageActions';

    // Éléments DOM
    const parcoursSelect = document.getElementById('parcours-select');
    const newParcoursBtn = document.getElementById('new-parcours-btn');
    const editParcoursBtn = document.getElementById('edit-parcours-btn');
    const duplicateParcoursBtn = document.getElementById('duplicate-parcours-btn');
    const deleteParcoursBtn = document.getElementById('delete-parcours-btn');
    const editParcoursContainer = document.getElementById('edit-parcours-container');
    const parcoursDetailsContainer = document.getElementById('parcours-details-container');

    // Modal elements
    const editorModal = document.getElementById('parcours-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const cancelEditorBtn = document.getElementById('cancel-editor-btn');
    const saveParcoursBtn = document.getElementById('save-parcours-btn');
    const editorTitle = document.getElementById('editor-title');

    // Confirmation modal
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmBackdrop = document.getElementById('confirmation-backdrop');
    const closeConfirmBtn = document.getElementById('close-confirm-btn');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const okConfirmBtn = document.getElementById('ok-confirm-btn');
    const confirmTitle = document.getElementById('confirm-modal-title');
    const confirmMessage = document.getElementById('confirm-modal-message');

    // Etapes elements
    const etapesContainer = document.getElementById('etapes-container');
    const addEtapeBtn = document.getElementById('add-etape-btn');

    // Guides selects
    const guideDissuasionSelect = document.getElementById('editor-guide-dissuasion');
    const guidesAttenteSelect = document.getElementById('editor-guides-attente');

    // Guides MER (multi-select)
    const guidesMerContainer = document.getElementById('editor-guides-mer-container');
    const addGuideMerBtn = document.getElementById('add-guide-mer-btn');

    // Current state
    let currentParcours = null;
    let isEditMode = false;
    let confirmAction = null;
    const editorGuard = window.createUnsavedChangesGuard ? window.createUnsavedChangesGuard('parcours-editor-modal') : null;
    let guidesDissuasion = [];
    let guidesAttente = [];
    let guidesMER = [];
    let availableActions = [];
    let availableGroupements = [];

    // Action select
    const actionSelect = document.getElementById('editor-action');

    // Groupement select
    const groupementSelect = document.getElementById('editor-groupement-guides');

    // =========================================================
    // CHARGEMENT DES DONNÉES
    // =========================================================

    /**
     * Charge les groupements de guides depuis Core_Ddb_IHM (Type='GroupeGuides')
     */
    async function loadGroupements() {
        try {
            const items = await window.dynamoDBService.scan(IHM_TABLE) || [];
            availableGroupements = items
                .filter(item => item.Type === 'GroupeGuides')
                .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
        } catch (err) {
            console.error('Erreur lors du chargement des groupements:', err);
        }
    }

    /**
     * Remplit le select des groupements
     */
    function populateGroupementsSelect(selectedName = '') {
        groupementSelect.innerHTML = '<option value="">-- Sélectionner un groupement (optionnel) --</option>';
        availableGroupements.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.Name;
            opt.textContent = g.Name;
            if (g.Name === selectedName) opt.selected = true;
            groupementSelect.appendChild(opt);
        });
    }

    /**
     * Quand on choisit un groupement : pré-remplit les 3 selects individuels
     */
    function onGroupementChange() {
        const name = groupementSelect.value;
        if (!name) return; // sélection vide : ne touche pas les selects individuels
        const g = availableGroupements.find(x => x.Name === name);
        if (!g) return;
        guideDissuasionSelect.value = g.GuideDissuasion || '';
        guidesAttenteSelect.value = g.GuidesAttente || '';
        // MER : peut être string ou array
        const merValue = g.GuidesMiseEnRelation || '';
        guidesMerContainer.innerHTML = '';
        if (Array.isArray(merValue)) {
            // Limiter à 5 guides MER max
            merValue.slice(0, 5).forEach(v => addGuideMerRow(v));
        } else if (merValue) {
            addGuideMerRow(merValue);
        }
        if (guidesMerContainer.children.length === 0) addGuideMerRow('');
    }

    /**
     * Charge la liste des actions depuis Core_Ddb_EnchainementParametrageActions
     */
    async function loadActions() {
        try {
            const items = await window.dynamoDBService.scan(ACTIONS_TABLE);
            if (!items) return;
            availableActions = items
                .map(item => item.Action)
                .filter(a => !!a)
                .sort();
        } catch (err) {
            console.error('Erreur lors du chargement des actions:', err);
        }
    }

    /**
     * Remplit le select des actions
     */
    function populateActionSelect(selectedValue = '') {
        actionSelect.innerHTML = '<option value="">-- Aucune --</option>';
        availableActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            if (action === selectedValue) option.selected = true;
            actionSelect.appendChild(option);
        });
    }

    /**
     * Charge la liste des guides vocaux depuis Core_Ddb_IHM
     * en cherchant l'item dont Name = 'Core_Mod_GuidesVocaux'
     * puis en filtrant sa liste Parametres par _DIS_, _ATT_, _MER_
     */
    async function loadGuidesVocaux() {
        try {
            // Utilise maintenant l'API Amazon Connect au lieu de DynamoDB
            const allGuides = await window.connectService.listAllPrompts();

            guidesDissuasion = allGuides
                .filter(g => g.includes('_DIS_'))
                .sort()
                .map(name => ({ Name: name }));

            guidesAttente = allGuides
                .filter(g => g.includes('_ATT_'))
                .sort()
                .map(name => ({ Name: name }));

            guidesMER = allGuides
                .filter(g => g.includes('_MER_'))
                .sort()
                .map(name => ({ Name: name }));

        } catch (err) {
            console.error('Erreur lors du chargement des guides vocaux via Connect:', err);
            showToast("Erreur lors du chargement des guides vocaux depuis Amazon Connect", 'error');
        }
    }

    /**
     * Remplit un select avec une liste de guides vocaux
     */
    function populateGuidesSelect(selectEl, guidesList, selectedValue = '') {
        // Garder l'option vide
        selectEl.innerHTML = '<option value="">-- Aucun --</option>';
        guidesList.forEach(guide => {
            const option = document.createElement('option');
            option.value = guide.Name;
            option.textContent = guide.Name;
            if (guide.Name === selectedValue) option.selected = true;
            selectEl.appendChild(option);
        });
    }

    // =========================================================
    // GESTION DES GUIDES MER MULTIPLES
    // =========================================================

    /**
     * Cache ou affiche le bouton "Ajouter" selon le nombre de guides MER
     */
    function updateMerAddButtonVisibility() {
        const MAX_MER_GUIDES = 5;
        const currentCount = guidesMerContainer.querySelectorAll('.guide-mer-row').length;
        if (currentCount >= MAX_MER_GUIDES) {
            addGuideMerBtn.classList.add('slds-hide');
        } else {
            addGuideMerBtn.classList.remove('slds-hide');
        }
    }

    /**
     * Ajoute une ligne select pour un guide MER dans le conteneur
     */
    function addGuideMerRow(selectedValue = '') {
        const MAX_MER_GUIDES = 5;
        const currentCount = guidesMerContainer.querySelectorAll('.guide-mer-row').length;

        if (currentCount >= MAX_MER_GUIDES) {
            showToast(`Limite atteinte : maximum ${MAX_MER_GUIDES} guides MER autorisés.`, 'warning');
            updateMerAddButtonVisibility();
            return;
        }

        const row = document.createElement('div');
        row.className = 'guide-mer-row';

        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'slds-select_container guide-mer-select-wrapper';
        const select = document.createElement('select');
        select.className = 'slds-select guide-mer-select';
        select.innerHTML = '<option value="">-- Aucun --</option>';
        guidesMER.forEach(guide => {
            const opt = document.createElement('option');
            opt.value = guide.Name;
            opt.textContent = guide.Name;
            if (guide.Name === selectedValue) opt.selected = true;
            select.appendChild(opt);
        });
        selectWrapper.appendChild(select);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'slds-button slds-button_icon slds-button_icon-error guide-mer-remove-btn';
        removeBtn.type = 'button';
        removeBtn.title = 'Supprimer ce guide';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
            row.remove();
            // Garder au moins une ligne
            if (guidesMerContainer.children.length === 0) addGuideMerRow('');
            updateMerAddButtonVisibility();
        });

        row.appendChild(selectWrapper);
        row.appendChild(removeBtn);
        guidesMerContainer.appendChild(row);
        updateMerAddButtonVisibility();
    }

    /**
     * Initialise le conteneur MER avec une liste de valeurs
     */
    function populateGuidesMerMulti(values) {
        guidesMerContainer.innerHTML = '';
        if (Array.isArray(values) && values.length > 0) {
            // Limiter à 5 guides MER max lors du chargement
            values.slice(0, 5).forEach(v => addGuideMerRow(v));
        } else if (typeof values === 'string' && values) {
            addGuideMerRow(values);
        } else {
            addGuideMerRow('');
        }
        updateMerAddButtonVisibility();
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

    /**
     * Charge la liste des parcours depuis DynamoDB
     */
    async function loadParcoursList() {
        try {
            parcoursSelect.innerHTML = '<option value="">Chargement...</option>';
            const items = await window.dynamoDBService.scan(TABLE_NAME);

            parcoursSelect.innerHTML = '<option value="">-- Sélectionner un parcours --</option>';

            if (items && items.length > 0) {
                items.sort((a, b) => (a.Parcours || '').localeCompare(b.Parcours || ''));
                items.forEach(parcours => {
                    const option = document.createElement('option');
                    option.value = parcours.Parcours;
                    option.textContent = parcours.Parcours;
                    parcoursSelect.appendChild(option);
                });
            } else {
                parcoursSelect.innerHTML = '<option value="">Aucun parcours trouvé. Utilisez « Nouveau Parcours » pour en créer.</option>';
            }
        } catch (err) {
            parcoursSelect.innerHTML = '<option value="">Erreur lors du chargement</option>';
            showToast("Erreur lors du chargement des parcours", 'error');
        }
    }

    /**
     * Charge et affiche les détails du parcours sélectionné
     */
    async function loadParcoursDetails() {
        const parcoursName = parcoursSelect.value;

        if (!parcoursName) {
            parcoursDetailsContainer.classList.add('slds-hide');
            editParcoursContainer.classList.add('slds-hide');
            return;
        }

        try {
            const parcours = await window.dynamoDBService.get(TABLE_NAME, { Parcours: parcoursName });

            if (!parcours) {
                showToast("Parcours non trouvé", 'error');
                return;
            }

            currentParcours = parcours;
            displayParcoursDetails(parcours);
            editParcoursContainer.classList.remove('slds-hide');
            parcoursDetailsContainer.classList.remove('slds-hide');
        } catch (err) {
            showToast("Erreur lors de la récupération du parcours", 'error');
        }
    }

    // =========================================================
    // AFFICHAGE DES DÉTAILS
    // =========================================================

    /**
     * Affiche les détails du parcours dans la card de lecture seule
     */
    function displayParcoursDetails(parcours) {
        const detailsContent = document.getElementById('parcours-details-content');
        document.getElementById('detail-parcours-name').textContent = parcours.Parcours;

        let html = '';

        // Champs simples
        // Formatter GuidesMiseEnRelation pour l'affichage (peut être string ou array)
        let merDisplay = '(non défini)';
        if (parcours.GuidesMiseEnRelation) {
            if (Array.isArray(parcours.GuidesMiseEnRelation)) {
                merDisplay = parcours.GuidesMiseEnRelation.length > 0 ? parcours.GuidesMiseEnRelation.join(', ') : '(non défini)';
            } else {
                merDisplay = parcours.GuidesMiseEnRelation;
            }
        }

        const simpleFields = [
            { label: 'Nom du Parcours', value: parcours.Parcours },
            { label: 'Action', value: parcours.Action || '(non défini)' },
            { label: 'Durée d\'attente max', value: parcours.DureeAttenteMax ? `${parcours.DureeAttenteMax} s` : '(non défini)' },
            { label: 'Queue', value: parcours.Queue || '(non défini)' },
            { label: 'Guide Dissuasion', value: parcours.GuideDissuasion || '(non défini)' },
            { label: 'Guides Attente', value: parcours.GuidesAttente || '(non défini)' },
            { label: 'Guides Mise en Relation', value: merDisplay },
        ];

        simpleFields.forEach(field => {
            html += `
                <div class="slds-col slds-size_1-of-2">
                    <div class="slds-form-element">
                        <span class="slds-form-element__label slds-text-title_bold">${field.label}</span>
                        <div class="slds-form-element__static">
                            <p>${escapeHtml(String(field.value))}</p>
                        </div>
                    </div>
                </div>
            `;
        });

        // Étapes
        if (parcours.Etapes && typeof parcours.Etapes === 'object') {
            const etapesKeys = Object.keys(parcours.Etapes).sort();
            if (etapesKeys.length > 0) {
                let etapesHtml = `
                    <table class="detail-etapes-table">
                        <thead>
                            <tr>
                                <th>Étape</th>
                                <th>Cible</th>
                                <th>Type</th>
                                <th>Critère Ciblage</th>
                                <th>Enchainement</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                etapesKeys.forEach(key => {
                    const etape = parcours.Etapes[key];
                    if (!etape) return;

                    const cible = etape.Cible || '';
                    const type = etape.Type || '';
                    const critere = formatCritereCiblage(etape.CritereCiblage);
                    const enchainement = etape.Enchainement;
                    let enchainementHtml = '(final)';
                    if (enchainement) {
                        const mode = enchainement.Mode || '';
                        const delai = enchainement.Delai !== undefined ? enchainement.Delai : '';
                        const badgeClass = mode === 'Elargissement' ?
                            'badge-mode-elargissement' : 'badge-mode-debordement';
                        enchainementHtml = `<span class="${badgeClass}">${escapeHtml(mode)}</span> ${delai ? `après ${delai}s` : ''}`;
                    }

                    etapesHtml += `
                        <tr>
                            <td><strong>${escapeHtml(key)}</strong></td>
                            <td>${escapeHtml(cible)}</td>
                            <td><span class="badge-type">${escapeHtml(type)}</span></td>
                            <td><code style="font-size:0.75rem">${escapeHtml(critere)}</code></td>
                            <td>${enchainementHtml}</td>
                        </tr>
                    `;
                });

                etapesHtml += '</tbody></table>';

                html += `
                    <div class="slds-col slds-size_1-of-1">
                        <div class="slds-form-element slds-m-top_small">
                            <label class="slds-form-element__label slds-text-title_bold">Étapes (${etapesKeys.length})</label>
                            <div class="slds-form-element__static">
                                ${etapesHtml}
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        detailsContent.innerHTML = html;
    }

    /**
     * Formate le CritereCiblage pour l'affichage
     */
    function formatCritereCiblage(critere) {
        if (!critere) return '(vide)';
        if (Array.isArray(critere)) {
            return critere.map(c => {
                if (typeof c === 'string') {
                    try {
                        const parsed = JSON.parse(c);
                        if (parsed.AttributeCondition) {
                            const ac = parsed.AttributeCondition;
                            return `${ac.Name}=${ac.Value} (ProfLevel≥${ac.ProficiencyLevel})`;
                        }
                    } catch (e) {/**/ }
                    return c;
                }
                return JSON.stringify(c);
            }).join('; ');
        }
        if (typeof critere === 'object') {
            return JSON.stringify(critere);
        }
        return String(critere);
    }

    /**
     * Échappe les caractères HTML pour éviter les injections
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================
    // GESTION DES ÉTAPES DANS LE FORMULAIRE
    // =========================================================

    /**
     * Cache ou affiche le bouton "Ajouter une Étape" selon le nombre d'étapes
     */
    function updateEtapeAddButtonVisibility() {
        const MAX_ETAPES = 5;
        const currentCount = etapesContainer.querySelectorAll('.etape-card').length;
        if (currentCount >= MAX_ETAPES) {
            addEtapeBtn.classList.add('slds-hide');
        } else {
            addEtapeBtn.classList.remove('slds-hide');
        }
    }

    /**
     * Ajoute une ligne d'étape dans le formulaire d'édition
     */
    function addEtapeRow(etapeData = null) {
        const MAX_ETAPES = 5;
        const currentCount = etapesContainer.querySelectorAll('.etape-card').length;

        if (currentCount >= MAX_ETAPES) {
            showToast(`Limite atteinte : maximum ${MAX_ETAPES} étapes de ciblage autorisées.`, 'warning');
            updateEtapeAddButtonVisibility();
            return;
        }

        const etapeIndex = currentCount + 1;
        const etapeDiv = document.createElement('div');
        etapeDiv.className = 'etape-card';

        const cible = etapeData ? (etapeData.Cible || '') : '';
        const type = etapeData ? (etapeData.Type || 'Groupes') : 'Groupes';
        const enchainementDelai = etapeData && etapeData.Enchainement ? (etapeData.Enchainement.Delai !== undefined ? etapeData.Enchainement.Delai : '') : '';
        const enchainementMode = etapeData && etapeData.Enchainement ? (etapeData.Enchainement.Mode || 'Elargissement') : 'Elargissement';

        // Critère ciblage : on stocke en JSON brut dans un textarea
        let critereStr = '';
        if (etapeData && etapeData.CritereCiblage) {
            if (Array.isArray(etapeData.CritereCiblage)) {
                critereStr = etapeData.CritereCiblage.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join('\n');
            } else {
                critereStr = JSON.stringify(etapeData.CritereCiblage, null, 2);
            }
        }

        etapeDiv.innerHTML = `
            <div class="etape-card-header">
                <span class="etape-label">Étape ${etapeIndex}</span>
                <button class="slds-button slds-button_destructive slds-button_small remove-etape-btn" type="button" title="Supprimer cette étape">🗑️</button>
            </div>
            <div class="slds-grid slds-wrap slds-gutters_small">
                <div class="slds-col slds-size_1-of-2">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label">Cible <abbr class="slds-required" title="required">*</abbr></label>
                        <div class="slds-form-element__control">
                            <input type="text" class="slds-input etape-cible" placeholder="Ex: CIBLE_ESA_CONFIRME" value="${escapeHtml(cible)}">
                        </div>
                    </div>
                </div>
                <div class="slds-col slds-size_1-of-2">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label">Type de ciblage</label>
                        <div class="slds-form-element__control">
                            <div class="slds-select_container">
                                <select class="slds-select etape-type">
                                    <option value="Groupes" ${type === 'Groupes' ? 'selected' : ''}>Groupes</option>
                                    <option value="NumeroSDA" ${type === 'NumeroSDA' ? 'selected' : ''}>NumeroSDA</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="slds-col slds-size_1-of-1">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label">Critère de Ciblage</label>
                        <div class="slds-form-element__control">
                            <textarea class="slds-textarea etape-critere" rows="3" placeholder='Ex: {"AttributeCondition": {"Name": "Entite", "Value": "ESA", "ProficiencyLevel": 1, "ComparisonOperator": "NumberGreaterOrEqualTo"}}'>${escapeHtml(critereStr)}</textarea>
                        </div>
                        <div class="slds-form-element__help">Peut être un JSON ou numéro SDA.</div>
                    </div>
                </div>
                <div class="slds-col slds-size_1-of-3">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label">Mode d'enchainement</label>
                        <div class="slds-form-element__control">
                            <div class="slds-select_container">
                                <select class="slds-select etape-enchainement-mode">
                                    <option value="">(Étape finale)</option>
                                    <option value="Elargissement" ${enchainementMode === 'Elargissement' ? 'selected' : ''}>Elargissement</option>
                                    <option value="Debordement" ${enchainementMode === 'Debordement' ? 'selected' : ''}>Débordement</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="slds-col slds-size_1-of-3">
                    <div class="slds-form-element">
                        <label class="slds-form-element__label">Délai avant étape suivante (s)</label>
                        <div class="slds-form-element__control">
                            <input type="number" class="slds-input etape-enchainement-delai" min="0" placeholder="Ex: 30" value="${enchainementDelai}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        etapeDiv.querySelector('.remove-etape-btn').addEventListener('click', () => {
            etapeDiv.remove();
            renumberEtapes();
        });

        etapesContainer.appendChild(etapeDiv);
        updateEtapeAddButtonVisibility();
    }

    /**
     * Renumérotage des étapes après suppression
     */
    function renumberEtapes() {
        etapesContainer.querySelectorAll('.etape-card').forEach((card, index) => {
            const label = card.querySelector('.etape-label');
            if (label) label.textContent = `Étape ${index + 1}`;
        });
        updateEtapeAddButtonVisibility();
    }

    /**
     * Lit les étapes depuis le formulaire et les convertit en objet Etapes
     */
    function getEtapesFromForm() {
        const etapes = {};
        etapesContainer.querySelectorAll('.etape-card').forEach((card, index) => {
            const cible = card.querySelector('.etape-cible').value.trim();
            const type = card.querySelector('.etape-type').value;
            const critereRaw = card.querySelector('.etape-critere').value.trim();
            const enchainementMode = card.querySelector('.etape-enchainement-mode').value;
            const enchainementDelai = card.querySelector('.etape-enchainement-delai').value.trim();

            const etapeKey = `Etape${index + 1}`;
            const etapeObj = {};

            if (cible) etapeObj.Cible = cible;
            etapeObj.Type = type;

            // CritereCiblage : on stocke comme liste de strings
            if (critereRaw) {
                etapeObj.CritereCiblage = [critereRaw];
            }

            // Enchainement (optionnel sur la dernière étape)
            if (enchainementMode) {
                etapeObj.Enchainement = {
                    Mode: enchainementMode
                };
                if (enchainementDelai !== '') {
                    etapeObj.Enchainement.Delai = parseInt(enchainementDelai) || 0;
                }
            }

            etapes[etapeKey] = etapeObj;
        });
        return etapes;
    }

    // =========================================================
    // MODALS CRUD
    // =========================================================

    /**
     * Réinitialise et ouvre la modale pour un nouveau parcours
     */
    function openNewParcoursModal() {
        isEditMode = false;
        currentParcours = null;
        editorTitle.textContent = 'Nouveau Parcours';

        document.getElementById('editor-parcours-name').value = '';
        document.getElementById('editor-parcours-name').removeAttribute('readonly');
        populateActionSelect('');
        document.getElementById('editor-duree-attente-max').value = '';
        document.getElementById('editor-queue').value = '';

        populateGroupementsSelect('');
        populateGuidesSelect(guideDissuasionSelect, guidesDissuasion);
        populateGuidesSelect(guidesAttenteSelect, guidesAttente);
        populateGuidesMerMulti([]);

        etapesContainer.innerHTML = '';
        addEtapeRow();

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Ouvre la modale d'édition pour un parcours existant
     */
    function openEditParcoursModal() {
        if (!currentParcours) return;

        isEditMode = true;
        editorTitle.textContent = `Éditer le Parcours : ${currentParcours.Parcours}`;

        document.getElementById('editor-parcours-name').value = currentParcours.Parcours;
        document.getElementById('editor-parcours-name').setAttribute('readonly', true);
        populateActionSelect(currentParcours.Action || '');
        document.getElementById('editor-duree-attente-max').value = currentParcours.DureeAttenteMax !== undefined ? currentParcours.DureeAttenteMax : '';
        document.getElementById('editor-queue').value = currentParcours.Queue || '';

        // Détecter si les guides correspondent à un groupement existant
        const matchingGroup = availableGroupements.find(g =>
            g.GuideDissuasion === (currentParcours.GuideDissuasion || '') &&
            g.GuidesAttente === (currentParcours.GuidesAttente || '')
        );
        populateGroupementsSelect(matchingGroup ? matchingGroup.Name : '');
        populateGuidesSelect(guideDissuasionSelect, guidesDissuasion, currentParcours.GuideDissuasion || '');
        populateGuidesSelect(guidesAttenteSelect, guidesAttente, currentParcours.GuidesAttente || '');
        populateGuidesMerMulti(currentParcours.GuidesMiseEnRelation || []);

        // Charger les étapes existantes
        etapesContainer.innerHTML = '';
        if (currentParcours.Etapes && typeof currentParcours.Etapes === 'object') {
            const etapesKeys = Object.keys(currentParcours.Etapes).sort();
            etapesKeys.forEach(key => {
                addEtapeRow(currentParcours.Etapes[key]);
            });
        }
        if (etapesContainer.querySelectorAll('.etape-card').length === 0) {
            addEtapeRow();
        }

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Duplique le parcours actuel
     */
    function duplicateCurrentParcours() {
        if (!currentParcours) return;

        isEditMode = false;
        editorTitle.textContent = 'Dupliquer le Parcours';

        document.getElementById('editor-parcours-name').value = `${currentParcours.Parcours}_COPY`;
        document.getElementById('editor-parcours-name').removeAttribute('readonly');
        populateActionSelect(currentParcours.Action || '');
        document.getElementById('editor-duree-attente-max').value = currentParcours.DureeAttenteMax !== undefined ? currentParcours.DureeAttenteMax : '';
        document.getElementById('editor-queue').value = currentParcours.Queue || '';

        const matchingGroupDup = availableGroupements.find(g =>
            g.GuideDissuasion === (currentParcours.GuideDissuasion || '') &&
            g.GuidesAttente === (currentParcours.GuidesAttente || '')
        );
        populateGroupementsSelect(matchingGroupDup ? matchingGroupDup.Name : '');
        populateGuidesSelect(guideDissuasionSelect, guidesDissuasion, currentParcours.GuideDissuasion || '');
        populateGuidesSelect(guidesAttenteSelect, guidesAttente, currentParcours.GuidesAttente || '');
        populateGuidesMerMulti(currentParcours.GuidesMiseEnRelation || []);

        etapesContainer.innerHTML = '';
        if (currentParcours.Etapes && typeof currentParcours.Etapes === 'object') {
            const etapesKeys = Object.keys(currentParcours.Etapes).sort();
            etapesKeys.forEach(key => {
                addEtapeRow(currentParcours.Etapes[key]);
            });
        }
        if (etapesContainer.querySelectorAll('.etape-card').length === 0) {
            addEtapeRow();
        }

        showModal(editorModal, editorBackdrop);
    }

    /**
     * Demande confirmation avant suppression
     */
    function confirmDelete() {
        if (!currentParcours) return;

        confirmTitle.textContent = 'Supprimer le Parcours';
        confirmMessage.textContent = `Êtes-vous sûr de vouloir supprimer le parcours "${currentParcours.Parcours}" ? Cette action ne peut pas être annulée.`;
        confirmAction = 'delete';

        showModal(confirmationModal, confirmBackdrop);
    }

    // =========================================================
    // SAUVEGARDE / SUPPRESSION
    // =========================================================

    /**
     * Sauvegarde le parcours (création ou mise à jour)
     */
    async function saveParcours() {
        const parcoursName = document.getElementById('editor-parcours-name').value.trim();
        if (!parcoursName) {
            showToast("Le nom du parcours est obligatoire", 'error');
            return;
        }

        const action = actionSelect.value.trim();
        const dureeAttenteMaxRaw = document.getElementById('editor-duree-attente-max').value.trim();
        const queue = document.getElementById('editor-queue').value.trim();
        const guideDissuasion = guideDissuasionSelect.value;
        const guidesAttente = guidesAttenteSelect.value;
        const guidesMerValues = getGuidesMerFromForm();

        const parcoursData = {
            Parcours: parcoursName
        };

        if (action) parcoursData.Action = action;
        if (dureeAttenteMaxRaw !== '') parcoursData.DureeAttenteMax = parseInt(dureeAttenteMaxRaw) || 0;
        if (queue) parcoursData.Queue = queue;
        if (guideDissuasion) parcoursData.GuideDissuasion = guideDissuasion;
        if (guidesAttente) parcoursData.GuidesAttente = guidesAttente;
        if (guidesMerValues.length > 0) {
            if (guidesMerValues.length > 5) {
                showToast("Maximum 5 guides MER autorisés", 'error');
                return;
            }
            parcoursData.GuidesMiseEnRelation = guidesMerValues;
        }

        // Étapes
        const etapes = getEtapesFromForm();
        if (Object.keys(etapes).length > 0) {
            parcoursData.Etapes = etapes;
        }

        try {
            saveParcoursBtn.disabled = true;
            saveParcoursBtn.textContent = 'Sauvegarde...';

            await window.dynamoDBService.put(TABLE_NAME, parcoursData);
            showToast("Parcours sauvegardé avec succès", 'success');
            hideModal(editorModal, editorBackdrop);
            await loadParcoursList();
            parcoursSelect.value = parcoursName;
            await loadParcoursDetails();
        } catch (err) {
            showToast("Erreur lors de la sauvegarde du parcours", 'error');
        } finally {
            saveParcoursBtn.disabled = false;
            saveParcoursBtn.textContent = 'Sauvegarder';
        }
    }

    /**
     * Supprime le parcours actuel
     */
    async function deleteCurrentParcours() {
        if (!currentParcours) return;

        try {
            await window.dynamoDBService.delete(TABLE_NAME, { Parcours: currentParcours.Parcours });
            showToast("Parcours supprimé avec succès", 'success');
            currentParcours = null;
            parcoursSelect.value = '';
            parcoursDetailsContainer.classList.add('slds-hide');
            editParcoursContainer.classList.add('slds-hide');
            await loadParcoursList();
        } catch (err) {
            showToast("Erreur lors de la suppression du parcours", 'error');
        }
    }

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

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================
    // EVENT LISTENERS
    // =========================================================

    parcoursSelect.addEventListener('change', () => loadParcoursDetails());
    newParcoursBtn.addEventListener('click', () => openNewParcoursModal());
    editParcoursBtn.addEventListener('click', () => openEditParcoursModal());
    duplicateParcoursBtn.addEventListener('click', () => duplicateCurrentParcours());
    deleteParcoursBtn.addEventListener('click', () => confirmDelete());
    addEtapeBtn.addEventListener('click', () => addEtapeRow());
    addGuideMerBtn.addEventListener('click', () => addGuideMerRow(''));

    // Groupement → mise à jour automatique des selects individuels
    groupementSelect.addEventListener('change', () => onGroupementChange());

    closeEditorBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(() => hideModal(editorModal, editorBackdrop));
        else hideModal(editorModal, editorBackdrop);
    });
    cancelEditorBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(() => hideModal(editorModal, editorBackdrop));
        else hideModal(editorModal, editorBackdrop);
    });
    saveParcoursBtn.addEventListener('click', () => saveParcours());

    closeConfirmBtn.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));
    cancelConfirmBtn.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));
    okConfirmBtn.addEventListener('click', async () => {
        hideModal(confirmationModal, confirmBackdrop);
        if (confirmAction === 'delete') {
            await deleteCurrentParcours();
        }
    });

    editorBackdrop.addEventListener('click', () => hideModal(editorModal, editorBackdrop));
    confirmBackdrop.addEventListener('click', () => hideModal(confirmationModal, confirmBackdrop));

    // =========================================================
    // INITIALISATION
    // =========================================================
    loadGuidesVocaux();
    loadActions();
    loadGroupements();
    loadParcoursList();
    if (window.addSearchFilter) window.addSearchFilter(parcoursSelect, 'Rechercher un parcours...');
});
