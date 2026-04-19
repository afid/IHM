/**
 * layout.js
 *
 * CE FICHIER GÈRE L'APPARENCE COMMUNE À TOUTES LES PAGES.
 * Il charge dynamiquement les composants HTML (header, sidebar, modal)
 * depuis le dossier /components/ via fetch().
 */

async function loadComponent(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur chargement ${url}`);
        return await response.text();
    } catch (error) {
        console.error(`Erreur lors du chargement du composant ${url}:`, error);
        if (window.showToast) {
            window.showToast(`Composant "${url}" non chargé`, 'error');
        }
        return '';
    }
}

async function injectLayout() {
    try {
        const [headerHtml, sidebarHtml, modalHtml] = await Promise.all([
            loadComponent('components/header.html'),
            loadComponent('components/sidebar.html'),
            loadComponent('components/help-modal.html')
        ]);

        const headerPlaceholder = document.getElementById('layout-header');
        const sidebarPlaceholder = document.getElementById('layout-sidebar');

        // On remplace les balises vides par le vrai contenu HTML
        if (headerPlaceholder && headerHtml) headerPlaceholder.outerHTML = headerHtml;
        if (sidebarPlaceholder && sidebarHtml) sidebarPlaceholder.outerHTML = sidebarHtml;

        // Si la fenêtre d'aide n'existe pas encore sur la page, on l'ajoute à la fin du corps (body)
        if (!document.getElementById('help-modal') && modalHtml) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // MISE EN ÉVIDENCE DU LIEN ACTIF
        const currentPath = window.location.pathname;
        const currentFile = currentPath.split('/').pop() || 'index.html';

        document.querySelectorAll('.slds-nav-vertical__item').forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === currentFile) {
                item.classList.add('slds-is-active');
                // Ouvrir l'accordéon parent si nécessaire
                const accordionSection = item.closest('.accordion-section');
                if (accordionSection) {
                    accordionSection.classList.add('is-open'); // Assure que la section est ouverte
                }
            } else {
                item.classList.remove('slds-is-active');
            }
        });

        // Dispatch un événement pour signaler que le layout est prêt
        // script.js écoute cet événement pour attacher ses listeners (menu mobile, etc.)
        document.dispatchEvent(new Event('layout-loaded'));

    } catch (error) {
        console.error('Erreur critique dans injectLayout:', error);
    }
}

// LANCEMENT AUTOMATIQUE
injectLayout();
