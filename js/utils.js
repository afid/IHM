/**
 * utils.js
 * Fonctions utilitaires partagées par toute l'application.
 * - Gestion des notifications (Toasts)
 * - Gestion de la modale de confirmation
 * - Validation
 */

(function() {
    // --- TOAST NOTIFICATIONS ---
    window.showToast = function (message, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-container');
        // Initialiser le conteneur de toasts s'il n'existe pas
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        let icon = '';
        let title = '';
        if (type === 'success') { icon = '✓'; title = 'Succès'; }
        else if (type === 'error') { icon = '✕'; title = 'Erreur'; }
        else { icon = 'ℹ'; title = 'Information'; }

        // Note: message peut contenir du texte mais on évite innerHTML pour le message lui-même par sécurité
        // sauf si besoin explicite. Ici on garde textContent pour le corps par défaut dans la structure ci-dessous,
        // mais le code original utilisait innerHTML ou textContent.
        // Le code original : body.textContent = message; (calendar-editor.js)
        // Le code original module dnis : body.textContent = message;

        toast.innerHTML = `
            <div class="toast-header">
                <div class="toast-icon-box">${icon}</div>
                <strong>${title}</strong>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="toast-body"></div>
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        `;

        toast.querySelector('.toast-body').textContent = message;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
            const progressBar = toast.querySelector('.toast-progress-bar');
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.style.transition = `width ${duration}ms linear`;
            }
        });

        setTimeout(() => {
            toast.classList.replace('show', 'hide');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // --- CONFIRMATION MODAL ---
    window.onConfirmCallback = null;

    window.showConfirmModal = function (title, message, callback) {
        const titleEl = document.getElementById('confirm-modal-title');
        const contentEl = document.getElementById('confirm-modal-content');
        const modal = document.getElementById('confirmation-modal');
        const backdrop = document.getElementById('confirmation-backdrop');

        if (titleEl) titleEl.textContent = title;
        if (contentEl) {
             contentEl.innerHTML = '';
             const p = document.createElement('p');
             p.innerHTML = message; // Autorise le HTML (ex: <strong>)
             p.style.whiteSpace = 'pre-wrap';
             contentEl.appendChild(p);
        }

        window.onConfirmCallback = callback;

        if (modal) modal.classList.add('slds-fade-in-open');
        if (backdrop) backdrop.classList.add('slds-backdrop_open');
    };

    window.closeConfirmModal = function () {
        const modal = document.getElementById('confirmation-modal');
        const backdrop = document.getElementById('confirmation-backdrop');
        if (modal) modal.classList.remove('slds-fade-in-open');
        if (backdrop) backdrop.classList.remove('slds-backdrop_open');
        window.onConfirmCallback = null;
    };

    // --- VALIDATORS ---
    window.validatePhoneNumber = function (phone) {
        if (!phone) return true; // Optionnel
        return /^\+\d{10,15}$/.test(phone);
    };

    // --- SEARCH FILTER FOR SELECTS ---
    window.addSearchFilter = function (selectElement, placeholder = 'Rechercher...') {
        if (!selectElement || selectElement.dataset.searchAttached) return;
        selectElement.dataset.searchAttached = 'true';

        selectElement.style.display = 'none';

        if (selectElement.parentNode && selectElement.parentNode.classList.contains('slds-select_container')) {
            selectElement.parentNode.classList.remove('slds-select_container');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'slds-combobox_container custom-combobox';

        const combobox = document.createElement('div');
        combobox.className = 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click';
        combobox.setAttribute('aria-expanded', 'false');
        combobox.setAttribute('aria-haspopup', 'listbox');
        combobox.setAttribute('role', 'combobox');

        const formElement = document.createElement('div');
        formElement.className = 'slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right';
        formElement.setAttribute('role', 'none');

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.className = 'slds-input slds-combobox__input';
        input.setAttribute('autocomplete', 'off');

        const iconContainer = document.createElement('span');
        iconContainer.className = 'slds-icon_container slds-input__icon slds-input__icon_right';
        iconContainer.innerHTML = '▼';
        iconContainer.style.cursor = 'pointer';
        iconContainer.style.pointerEvents = 'auto';
        iconContainer.style.fontSize = '12px';
        iconContainer.style.color = '#706e6b';

        formElement.appendChild(input);
        formElement.appendChild(iconContainer);

        const dropdown = document.createElement('div');
        dropdown.className = 'slds-dropdown slds-dropdown_fluid slds-dropdown_length-5';
        dropdown.setAttribute('role', 'listbox');

        const listbox = document.createElement('ul');
        listbox.className = 'slds-listbox slds-listbox_vertical';
        listbox.setAttribute('role', 'presentation');

        dropdown.appendChild(listbox);
        combobox.appendChild(formElement);
        combobox.appendChild(dropdown);
        wrapper.appendChild(combobox);

        selectElement.parentNode.insertBefore(wrapper, selectElement);

        let allOptions = [];

        function captureOptions() {
            allOptions = Array.from(selectElement.options)
                .filter(opt => opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent,
                    selected: opt.selected,
                    disabled: opt.disabled
                }));
        }

        function renderDropdown(filterText = '') {
            listbox.innerHTML = '';
            let hasVisibleOptions = false;
            const term = filterText.toLowerCase();

            allOptions.forEach(opt => {
                if (opt.text.toLowerCase().includes(term) || (!opt.value && term === '')) {
                    hasVisibleOptions = true;
                    const li = document.createElement('li');
                    li.className = 'slds-listbox__item';
                    li.setAttribute('role', 'presentation');

                    const div = document.createElement('div');
                    div.className = 'slds-media slds-listbox__option slds-listbox__option_plain slds-media_small slds-media_center';
                    if (opt.value === selectElement.value && selectElement.value !== '') {
                        div.classList.add('slds-is-selected');
                        div.style.backgroundColor = '#f3f3f3';
                    }
                    div.setAttribute('role', 'option');

                    const textSpan = document.createElement('span');
                    textSpan.className = 'slds-media__body';
                    textSpan.innerHTML = `<span class="slds-truncate" title="${opt.text}">${opt.text}</span>`;

                    div.appendChild(textSpan);
                    li.appendChild(div);

                    li.addEventListener('mousedown', (e) => {
                        e.preventDefault(); // avert input blur before handling click
                        selectElement.value = opt.value;
                        syncInputFromSelect();
                        selectElement.dispatchEvent(new Event('change'));
                        closeDropdown();
                    });

                    li.addEventListener('mouseenter', () => div.style.backgroundColor = '#f3f3f3');
                    li.addEventListener('mouseleave', () => div.style.backgroundColor = (opt.value === selectElement.value && selectElement.value !== '') ? '#f3f3f3' : '');

                    listbox.appendChild(li);
                }
            });

            if (!hasVisibleOptions) {
                const li = document.createElement('li');
                li.className = 'slds-listbox__item';
                li.innerHTML = `<div class="slds-media slds-listbox__option"><span class="slds-media__body"><span class="slds-truncate" style="padding: 0.5rem;">Aucun résultat</span></span></div>`;
                listbox.appendChild(li);
            }
        }

        function syncInputFromSelect() {
            const val = selectElement.value;
            const selectedOpt = allOptions.find(o => o.value === val);
            if (val && selectedOpt) {
                input.value = selectedOpt.text;
            } else {
                input.value = '';
            }
        }

        function openDropdown() {
            combobox.classList.add('slds-is-open');
            combobox.setAttribute('aria-expanded', 'true');
        }

        function closeDropdown() {
            combobox.classList.remove('slds-is-open');
            combobox.setAttribute('aria-expanded', 'false');
        }

        input.addEventListener('input', () => {
            openDropdown();
            renderDropdown(input.value);
        });

        input.addEventListener('focus', () => {
            openDropdown();
            renderDropdown('');
            input.select();
        });

        input.addEventListener('blur', () => {
             // Let click resolve
             setTimeout(() => {
                 closeDropdown();
                 syncInputFromSelect();
             }, 200);
        });

        iconContainer.addEventListener('mousedown', (e) => {
             e.preventDefault();
             if (combobox.classList.contains('slds-is-open')) {
                 closeDropdown();
             } else {
                 input.focus();
             }
        });

        selectElement.addEventListener('change', () => {
            syncInputFromSelect();
        });

        const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(selectElement, 'value', {
            get() {
                return originalDescriptor.get.call(this);
            },
            set(val) {
                originalDescriptor.set.call(this, val);
                syncInputFromSelect();
            }
        });

        const observer = new MutationObserver(() => {
            captureOptions();
            syncInputFromSelect();
        });
        observer.observe(selectElement, { childList: true });

        captureOptions();
        syncInputFromSelect();
    };

    // --- UNSAVED CHANGES GUARD ---
    window.createUnsavedChangesGuard = function (containerOrId) {
        const container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;

        let dirty = false;

        if (container) {
            container.addEventListener('input', () => { dirty = true; });
            container.addEventListener('change', () => { dirty = true; });
        }

        return {
            get isDirty() { return dirty; },
            reset() { dirty = false; },
            markDirty() { dirty = true; },
            guardClose(callback) {
                if (dirty) {
                    window.showConfirmModal(
                        'Modifications non sauvegardées',
                        'Vous avez des modifications non sauvegardées. Voulez-vous vraiment fermer sans sauvegarder ?',
                        () => {
                            dirty = false;
                            callback();
                        }
                    );
                } else {
                    callback();
                }
            }
        };
    };

    // --- CROSS-REFERENCE CHECK ---
    window.checkCrossReferences = async function (tableName, filterExpression, expressionAttributeValues, expressionAttributeNames) {
        try {
            const params = { filterExpression, expressionAttributeValues };
            if (expressionAttributeNames) params.expressionAttributeNames = expressionAttributeNames;
            const results = await window.dynamoDBService.scan(tableName, params);
            return results || [];
        } catch (err) {
            console.error("Erreur lors de la vérification des références croisées:", err);
            return [];
        }
    };

    // Initialize Global Listeners for Confirm Modal
    document.addEventListener('DOMContentLoaded', () => {
        const closeConfirmBtn = document.getElementById('close-confirm-btn');
        const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
        const okConfirmBtn = document.getElementById('ok-confirm-btn');

        if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', window.closeConfirmModal);
        if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', window.closeConfirmModal);
        if (okConfirmBtn) okConfirmBtn.addEventListener('click', () => {
            if (window.onConfirmCallback) window.onConfirmCallback();
            window.closeConfirmModal();
        });
    });

})();
