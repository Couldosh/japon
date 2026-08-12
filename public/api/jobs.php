<?php
/**
 * Relais same-origin vers le backend ClaudeApiTkt (ia.faburisu.com) pour le menu caché "jobs"
 * (lancement des scripts de maintenance du Sheet, voir JobsService/JobsPanelComponent) — même
 * principe que api/ai.php, voir ce fichier pour le détail (Service Token Cloudflare Access
 * injecté au déploiement, appel serveur-à-serveur pour éviter tout souci CORS/cookie cross-site).
 *
 * Contrairement à ai.php (POST uniquement), /etat est en GET (polling de progression) : la query
 * string (ex: ?depuis=12) est donc transmise telle quelle au backend, sans corps de requête.
 *
 * Appelé via une URL du type /api/jobs.php/horaires/lancer ou /api/jobs.php/etat (PATH_INFO),
 * voir environment.prod.ts (jobsApiUrl: '/api/jobs.php') et JobsService.
 */

$clientId = '__CF_ACCESS_CLIENT_ID__';
$clientSecret = '__CF_ACCESS_CLIENT_SECRET__';

$backendBase = 'https://ia.faburisu.com/jobs';

$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$routesPost = ['/horaires/lancer', '/menu/lancer', '/localisation/lancer', '/dupliquer-quartiers/lancer', '/annuler'];
$routesGet = ['/etat'];

header('Content-Type: application/json');

$methode = $_SERVER['REQUEST_METHOD'];
$routeAutorisee = ($methode === 'POST' && in_array($pathInfo, $routesPost, true))
    || ($methode === 'GET' && in_array($pathInfo, $routesGet, true));

if (!$routeAutorisee) {
    http_response_code(in_array($pathInfo, [...$routesPost, ...$routesGet], true) ? 405 : 404);
    echo json_encode(['detail' => in_array($pathInfo, [...$routesPost, ...$routesGet], true) ? 'Method Not Allowed' : 'Not Found']);
    exit;
}

$url = $backendBase . $pathInfo;
if ($methode === 'GET' && $_SERVER['QUERY_STRING'] !== '') {
    $url .= '?' . $_SERVER['QUERY_STRING'];
}

$ch = curl_init($url);
$entetes = [
    'CF-Access-Client-Id: ' . $clientId,
    'CF-Access-Client-Secret: ' . $clientSecret,
];

if ($methode === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    $entetes[] = 'Content-Type: application/json';
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $entetes);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$reponse = curl_exec($ch);
$statut = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$erreurCurl = curl_error($ch);
$erreurNo = curl_errno($ch);
curl_close($ch);

if ($reponse === false) {
    http_response_code($erreurNo === CURLE_OPERATION_TIMEDOUT ? 504 : 502);
    echo json_encode(['detail' => 'Erreur du relais jobs: ' . $erreurCurl]);
    exit;
}

http_response_code($statut);
echo $reponse;
