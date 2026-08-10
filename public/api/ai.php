<?php
/**
 * Relais same-origin vers le backend ClaudeApiTkt (ia.faburisu.com), authentifié par un
 * Service Token Cloudflare Access. Le navigateur ne parle qu'à ce domaine (japon.kidsgonflablesparty.nc) ;
 * ce script fait l'appel serveur-à-serveur — évite tout problème de cookie/CORS cross-site
 * (voir la mémoire "project-ai-backend-cloudflare-oauth" côté ClaudeApiTkt pour l'historique).
 *
 * IMPORTANT : ce fichier contient un secret (Service Token). Il n'est jamais exposé au
 * navigateur (PHP exécuté côté serveur), mais s'il finit dans un dépôt git public, remplace
 * ces valeurs par des variables d'environnement lues via getenv() et configurées dans Plesk
 * (Hosting Settings > Variables d'environnement PHP) plutôt que codées en dur ici.
 *
 * Appelé via une URL du type /api/ai.php/description (PATH_INFO), voir environment.prod.ts
 * (iaApiUrl: '/api/ai.php') et IaService, qui construit les chemins par simple concatenation.
 */

// À remplacer par le Client ID / Client Secret du Service Token créé dans
// Cloudflare Zero Trust (Access > Service Auth > Service Tokens).
$clientId = 'd22db8938fa53a8c501c3c99d30393e1.access';
$clientSecret = '65b7604710711bf8bdb5e4c4ea883a3bb18376249f9bec21a2beaf9de2664e5e';

$backendBase = 'https://ia.faburisu.com/ai';

$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$routesAutorisees = ['/description', '/plats', '/resume-quotidien', '/plat-info', '/recherche-restaurant', '/recherche-lieu'];

header('Content-Type: application/json');

if (!in_array($pathInfo, $routesAutorisees, true)) {
    http_response_code(404);
    echo json_encode(['detail' => 'Not Found']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['detail' => 'Method Not Allowed']);
    exit;
}

$corpsRequete = file_get_contents('php://input');

$ch = curl_init($backendBase . $pathInfo);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $corpsRequete);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'CF-Access-Client-Id: ' . $clientId,
    'CF-Access-Client-Secret: ' . $clientSecret,
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);

$reponse = curl_exec($ch);
$statut = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$erreurCurl = curl_error($ch);
$erreurNo = curl_errno($ch);
curl_close($ch);

if ($reponse === false) {
    http_response_code($erreurNo === CURLE_OPERATION_TIMEDOUT ? 504 : 502);
    echo json_encode(['detail' => 'Erreur du relais IA: ' . $erreurCurl]);
    exit;
}

http_response_code($statut);
echo $reponse;
