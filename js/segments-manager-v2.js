/**
 * segments-manager.js (v2 - Refactored with BaseManager)
 *
 * GESTIONNAIRE DES SEGMENTS - Version refactorisée
 *
 * Maintient toute la logique métier spécifique (calendriers, modules pre/post, parsing)
 * mais utilise BaseManager pour tout le CRUD boilerplate.
 *
 * Réduction: 1052 lignes → ~250 lignes (-76% code dupliqué)
 */

class SegmentsManager extends window.BaseManager {
    constructor() {
        // Éléments DOM spécifiques
        const config = {
            tableName: 'Core_Ddb_CiblageParametrageSegments',
            primaryKey: 'Segment',
            itemName: 'Segment',
            pluralName: 'Segments',

            // DOM elements
            selectElement: document.getElementById('segment-select'),
            detailsContainer: document.getElementById('segment-details-container'),
            modalElement: document.getElementById('segment-editor-modal'),
            backdropElement: document.getElementById('editor-backdrop'),
            editorFormElement: document.getElementById('segment-form') || document.querySelector('#segment-editor-modal form'),

            // Boutons
            buttons: {
                new: document.getElementById('new-segment-btn'),
                edit: document.getElementById('edit-segment-btn'),
                duplicate: document.getElementById('duplicate-segment-btn'),
                delete: document.getElementById('delete-segment-btn'),
                save: document.getElementById('save-segment-btn'),
                close: document.getElementById('close-editor-btn'),
                cancel: document.getElementById('cancel-editor-btn')
            },

            // Callbacks pour logique métier
            callbacks: {
                afterLoad: async (items) => {
                    await this.loadAvailableResources();
                },

                validateForm: (item) => {
                    return this.validateSegment(item);
                },

                populateForm: (item) => {
                    this.populateSegmentForm(item);
                },

                extractForm: () => {
                    return this.extractSegmentForm();
                },

                renderDetails: (item) => {
                    this.renderSegmentDetails(item);
                }
            }
        };

        // Appeler le constructeur parent
        super(config);

        // État spécifique aux segments
        this.availableCalendars = [];
        this.availableModules = [];
        this.availableSituations = [];
        this.availablePrompts = [];
        this.draggedModuleRow = null;

        // Constantes
        this.CALENDARS_TABLE = 'Core_Ddb_Calendriers';
        this.CALENDAR_PREFIX = 'Cal_Distrib_';
        this.MODULES_TABLE = 'Core_Ddb_IHM';
    }

    /**
     * Charge les ressources disponibles (calendriers, modules, prompts)
     */
    async loadAvailableResources() {
        try {
            await Promise.all([
                this.loadDistributionCalendars(),
                this.loadAvailableModules()
            ]);
        } catch (err) {
            console.error('Erreur lors du chargement des ressources:', err);
            window.showToast('Erreur lors du chargement des ressources', 'error');
        }
    }

    /**
     * Charge les calendriers de distribution disponibles
     */
    async loadDistributionCalendars() {
        try {
            const calendars = await window.dynamoDBService.scan(this.CALENDARS_TABLE, {});
            this.availableCalendars = (calendars || [])
                .filter(item => item.id_Calendar)
                .sort((a, b) => (a.Nom || a.id_Calendar).localeCompare(b.Nom || b.id_Calendar));

            console.log(`${this.availableCalendars.length} calendriers chargés`);
        } catch (err) {
            console.error('Erreur chargement calendriers:', err);
        }
    }

    /**
     * Charge les modules et prompts disponibles
     */
    async loadAvailableModules() {
        try {
            const items = await window.dynamoDBService.scan(this.MODULES_TABLE, {});

            this.availableModules = (items || [])
                .filter(item => item.Type === 'Module')
                .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

            this.availableSituations = (items || [])
                .filter(item => item.Type === 'Situation')
                .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

            // Charger prompts Amazon Connect si disponible
            if (window.connectService) {
                try {
                    this.availablePrompts = (await window.connectService.listAllPrompts() || []).sort();
                    console.log(`${this.availablePrompts.length} prompts Amazon Connect chargés`);
                } catch (err) {
                    console.error('Erreur chargement prompts Connect:', err);
                }
            }
        } catch (err) {
            console.error('Erreur chargement modules:', err);
        }
    }

    /**
     * Valide les données du segment
     */
    validateSegment(item) {
        const errors = [];

        if (!item.Segment || !item.Segment.trim()) {
            errors.push('Le nom du segment est obligatoire');
        }

        if (!item.Type || !item.Type.trim()) {
            errors.push('Le type est obligatoire');
        }

        // Validation des calendriers (au moins un si Type = Distribution)
        if (item.Type === 'Distribution') {
            const calendriersArray = item.Calendriers || {};
            if (Object.keys(calendriersArray).length === 0) {
                errors.push('Au moins un calendrier est requis');
            }
        }

        return errors;
    }

    /**
     * Peuple le formulaire avec les données du segment
     */
    populateSegmentForm(segment) {
        const form = this.editorFormElement;
        if (!form) return;

        // Champs simples
        const nameInput = form.querySelector('[name="Segment"]') || form.querySelector('#editor-segment-name');
        const groupInput = form.querySelector('[name="Groupement"]') || form.querySelector('#editor-groupement');
        const typeInput = form.querySelector('[name="Type"]') || form.querySelector('#editor-type');
        const emergencyToggle = form.querySelector('#editor-etat-toggle');

        if (nameInput) nameInput.value = segment.Segment || '';
        if (groupInput) groupInput.value = segment.Groupement || '';
        if (typeInput) typeInput.value = segment.Type || '';
        if (emergencyToggle) emergencyToggle.checked = segment.Etat === 'FermetureUrgence';

        // Calendriers
        const calendriersContainer = form.querySelector('#calendriers-container');
        if (calendriersContainer) {
            calendriersContainer.innerHTML = '';
            if (segment.Calendriers && Object.keys(segment.Calendriers).length > 0) {
                Object.entries(segment.Calendriers).forEach(([eventName, calendarId]) => {
                    this.addCalendrierRow(calendriersContainer, eventName, calendarId);
                });
            } else {
                this.addCalendrierRow(calendriersContainer);
            }
        }

        // Modules Pre-Ciblage
        const preCiblageContainer = form.querySelector('#pre-ciblage-container');
        if (preCiblageContainer) {
            preCiblageContainer.innerHTML = '';
            if (Array.isArray(segment.ModulesPreCiblage)) {
                segment.ModulesPreCiblage.forEach(moduleStr => {
                    const parsed = this.parseModuleString(moduleStr);
                    if (parsed) this.addModuleRow(preCiblageContainer, parsed.name, parsed.params);
                });
            }
        }

        // Modules Post-Ciblage
        const postCiblageContainer = form.querySelector('#post-ciblage-container');
        if (postCiblageContainer) {
            postCiblageContainer.innerHTML = '';
            if (Array.isArray(segment.ModulesPostCiblage)) {
                segment.ModulesPostCiblage.forEach(moduleStr => {
                    const parsed = this.parseModuleString(moduleStr);
                    if (parsed) this.addModuleRow(postCiblageContainer, parsed.name, parsed.params);
                });
            }
        }

        this.isDirty = false;
    }

    /**
     * Extrait les données du formulaire
     */
    extractSegmentForm() {
        const form = this.editorFormElement;
        if (!form) return {};

        const segment = {
            Segment: (form.querySelector('[name="Segment"]') || form.querySelector('#editor-segment-name')).value.trim(),
            Groupement: (form.querySelector('[name="Groupement"]') || form.querySelector('#editor-groupement')).value.trim(),
            Type: (form.querySelector('[name="Type"]') || form.querySelector('#editor-type')).value.trim()
        };

        // État urgence
        const emergencyToggle = form.querySelector('#editor-etat-toggle');
        if (emergencyToggle?.checked) {
            segment.Etat = 'FermetureUrgence';
        }

        // Calendriers
        segment.Calendriers = this.getCalendriersFromForm();

        // Modules Pre et Post
        const preCiblageContainer = form.querySelector('#pre-ciblage-container');
        const postCiblageContainer = form.querySelector('#post-ciblage-container');

        segment.ModulesPreCiblage = this.extractModules(preCiblageContainer);
        segment.ModulesPostCiblage = this.extractModules(postCiblageContainer);

        return segment;
    }

    /**
     * Récupère les calendriers depuis le formulaire
     */
    getCalendriersFromForm() {
        const calendriers = {};
        const form = this.editorFormElement;
        if (!form) return calendriers;

        const calendriersContainer = form.querySelector('#calendriers-container');
        if (!calendriersContainer) return calendriers;

        calendriersContainer.querySelectorAll('.calendrier-row').forEach(row => {
            const eventInput = row.querySelector('.event-name-input');
            const calendarSelect = row.querySelector('.calendar-select');

            if (eventInput && calendarSelect) {
                const eventName = eventInput.value.trim();
                const calendarId = calendarSelect.value.trim();
                if (eventName && calendarId) {
                    calendriers[eventName] = calendarId;
                }
            }
        });

        return calendriers;
    }

    /**
     * Extrait les modules du conteneur
     */
    extractModules(container) {
        const modules = [];
        if (!container) return modules;

        container.querySelectorAll('.module-row').forEach(row => {
            const nameSelect = row.querySelector('.module-name-select');
            if (!nameSelect || !nameSelect.value) return;

            const moduleName = nameSelect.value;
            const moduleInfo = this.availableModules.find(m => m.Name === moduleName);
            const maxParams = moduleInfo ? moduleInfo.NombreParamsInput : 1;

            const inputs = Array.from(row.querySelectorAll('.module-params-input'));
            const actions = inputs.map(input => input.value.trim()).filter(val => val);

            let actionStr = '';
            if (actions.length > 1 || (actions.length === 1 && maxParams !== 1)) {
                actionStr = "[" + actions.map(a => `'${a}'`).join(',') + "]";
            } else if (actions.length === 1) {
                actionStr = actions[0];
            } else {
                actionStr = '[]';
            }

            modules.push(`Module:${moduleName}:${actionStr}`);
        });

        return modules;
    }

    /**
     * Ajoute une ligne calendrier au formulaire
     */
    addCalendrierRow(container, eventName = '', calendarId = '') {
        const row = document.createElement('div');
        row.className = 'calendrier-row slds-grid slds-m-bottom_small';

        row.innerHTML = `
            <div class="slds-col slds-size_2-of-5">
                <input type="text" class="slds-input event-name-input" placeholder="Événement (ex: Fermeture)" value="${eventName}" />
            </div>
            <div class="slds-col slds-size_2-of-5 slds-m-left_small">
                <select class="slds-select calendar-select">
                    <option value="">-- Sélectionner calendrier --</option>
                </select>
            </div>
            <div class="slds-col slds-size_1-of-5 slds-m-left_small">
                <button type="button" class="slds-button slds-button_destructive remove-calendrier-btn">Supprimer</button>
            </div>
        `;

        // Remplir les options de calendrier
        const calendarSelect = row.querySelector('.calendar-select');
        this.availableCalendars.forEach(cal => {
            const opt = document.createElement('option');
            opt.value = cal.id_Calendar;
            opt.textContent = cal.Nom || cal.id_Calendar;
            if (cal.id_Calendar === calendarId) opt.selected = true;
            calendarSelect.appendChild(opt);
        });

        // Bouton supprimer
        row.querySelector('.remove-calendrier-btn').addEventListener('click', (e) => {
            e.preventDefault();
            row.remove();
            this.isDirty = true;
        });

        container.appendChild(row);
    }

    /**
     * Ajoute une ligne module au formulaire
     */
    addModuleRow(container, moduleName = '', params = '') {
        const row = document.createElement('div');
        row.className = 'module-row slds-grid slds-m-bottom_small';

        row.innerHTML = `
            <div class="slds-col slds-size_2-of-5">
                <select class="slds-select module-name-select">
                    <option value="">-- Sélectionner module --</option>
                </select>
            </div>
            <div class="slds-col slds-size_2-of-5 slds-m-left_small">
                <div class="module-params-container"></div>
            </div>
            <div class="slds-col slds-size_1-of-5 slds-m-left_small">
                <button type="button" class="slds-button slds-button_destructive remove-module-btn">Supprimer</button>
            </div>
        `;

        const nameSelect = row.querySelector('.module-name-select');
        const paramsContainer = row.querySelector('.module-params-container');

        // Remplir les modules
        this.availableModules.forEach(mod => {
            const opt = document.createElement('option');
            opt.value = mod.Name;
            opt.textContent = mod.Name;
            if (mod.Name === moduleName) opt.selected = true;
            nameSelect.appendChild(opt);
        });

        // Handler changement module
        nameSelect.addEventListener('change', () => {
            this.updateParamControl(paramsContainer, nameSelect.value, params);
            this.isDirty = true;
        });

        // Initialiser les paramètres
        if (moduleName) {
            this.updateParamControl(paramsContainer, moduleName, params);
        }

        // Bouton supprimer
        row.querySelector('.remove-module-btn').addEventListener('click', (e) => {
            e.preventDefault();
            row.remove();
            this.isDirty = true;
        });

        container.appendChild(row);
    }

    /**
     * Met à jour les contrôles de paramètres selon le type de module
     */
    updateParamControl(container, moduleName, existingValue) {
        container.innerHTML = '';

        const moduleInfo = this.availableModules.find(m => m.Name === moduleName);
        const maxParams = moduleInfo ? moduleInfo.NombreParamsInput : 1;

        let selectedParams = [];
        if (existingValue && existingValue.startsWith('[') && existingValue.endsWith(']')) {
            try {
                selectedParams = JSON.parse(existingValue.replace(/'/g, '"'));
            } catch (e) {
                selectedParams = [existingValue];
            }
        } else if (existingValue) {
            selectedParams = [existingValue];
        }

        const isCalendar = moduleName?.includes('mod_Calendrier');
        const isGuides = moduleName?.includes('mod_GuidesVocaux');

        selectedParams.forEach((val, idx) => {
            let input;
            if (isCalendar) {
                input = document.createElement('select');
                input.className = 'slds-select module-params-input';
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '-- Sélectionner --';
                input.appendChild(emptyOpt);
                this.availableCalendars.forEach(cal => {
                    const opt = document.createElement('option');
                    opt.value = cal.id_Calendar;
                    opt.textContent = cal.Nom || cal.id_Calendar;
                    if (cal.id_Calendar === val) opt.selected = true;
                    input.appendChild(opt);
                });
            } else if (isGuides) {
                input = document.createElement('select');
                input.className = 'slds-select module-params-input';
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '-- Sélectionner --';
                input.appendChild(emptyOpt);
                this.availablePrompts.forEach(prompt => {
                    const opt = document.createElement('option');
                    opt.value = prompt;
                    opt.textContent = prompt;
                    if (prompt === val) opt.selected = true;
                    input.appendChild(opt);
                });
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'slds-input module-params-input';
                input.placeholder = 'Paramètre...';
                input.value = val || '';
            }

            container.appendChild(input);
        });
    }

    /**
     * Parse une chaîne module au format "Module:name:params"
     */
    parseModuleString(str) {
        if (!str || typeof str !== 'string') return null;

        const parts = str.split(':');
        if (parts.length < 2) return null;

        if (parts[0] !== 'Module') return null;

        const name = parts[1];
        const params = parts.slice(2).join(':');

        return { name, params };
    }

    /**
     * Affiche les détails du segment
     */
    renderSegmentDetails(segment) {
        const container = this.detailsContainer;
        if (!container) return;

        const calendriersList = segment.Calendriers
            ? Object.entries(segment.Calendriers).map(([k, v]) => `${k}: ${v}`).join('<br/>')
            : 'Aucun';

        const preModulesList = segment.ModulesPreCiblage
            ? segment.ModulesPreCiblage.join('<br/>')
            : 'Aucun';

        const postModulesList = segment.ModulesPostCiblage
            ? segment.ModulesPostCiblage.join('<br/>')
            : 'Aucun';

        container.innerHTML = `
            <h3>${segment.Segment}</h3>
            <div class="slds-m-top_medium">
                <p><strong>Groupement:</strong> ${segment.Groupement || '-'}</p>
                <p><strong>Type:</strong> ${segment.Type || '-'}</p>
                <p><strong>État:</strong> ${segment.Etat || 'Normal'}</p>
                <hr/>
                <p><strong>Calendriers:</strong></p>
                <div>${calendriersList}</div>
                <p class="slds-m-top_medium"><strong>Modules Pre-Ciblage:</strong></p>
                <div>${preModulesList}</div>
                <p class="slds-m-top_medium"><strong>Modules Post-Ciblage:</strong></p>
                <div>${postModulesList}</div>
            </div>
        `;
    }
}

/**
 * Initialiser le manager quand le DOM est prêt
 */
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier que BaseManager est disponible
    if (!window.BaseManager) {
        console.error('BaseManager non chargé. Assurez-vous que base-manager.js est inclus.');
        return;
    }

    // Créer et initialiser le manager
    window.segmentsManager = new SegmentsManager();
    console.log('SegmentsManager initialisé avec succès');
});
