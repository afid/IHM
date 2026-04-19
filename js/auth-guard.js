/**
 * auth-guard.js
 *
 * LE GARDIEN DE SÉCURITÉ :
 * Ce petit script vérifie que l'utilisateur est bien passé par la page de connexion.
 * S'il essaie d'accéder à une page sans être connecté, il est automatiquement
 * renvoyé vers la page de login pour s'identifier.
 */
(function () {
    const isAuthenticated = sessionStorage.getItem('ihm_auth_user');
    const currentPage = window.location.pathname.split('/').pop();

    // Si on n'est pas sur login.html et qu'on n'est pas connecté
    if (currentPage !== 'login.html' && !isAuthenticated) {
        console.warn("Accès refusé : utilisateur non connecté. Redirection vers login.html");
        window.location.href = 'login.html';
    }
    // SÉCURITÉ : Vérifier que les clés en session sont toujours valides via un appel STS léger
    else if (currentPage !== 'login.html' && isAuthenticated) {
        if (typeof AWS !== 'undefined') {
            const sts = new AWS.STS();
            sts.getCallerIdentity({}, function (err, data) {
                if (err) {
                    console.error("Session AWS invalide ou expirée:", err);
                    sessionStorage.clear();
                    window.location.href = 'login.html';
                }
            });
        }
    }
})();
