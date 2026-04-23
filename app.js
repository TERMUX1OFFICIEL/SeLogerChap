'use strict';

/* ══════════════════════════════════════
   SELOGERCHAP — app.js
   Logique complète : Auth, Annonces,
   Dashboard, Inscription multi-profil
══════════════════════════════════════ */

/* ── EmailJS ── */
var EJS_KEY = '4EnEMAc7LUswwJm0Z';
var EJS_SVC = 'service_q77l9jk';
var EJS_TPL = 'template_verification';
emailjs.init(EJS_KEY);

/* ── Sécurité SHA-256 ── */
async function sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

/* ══════════════════════════════════════
   1. DONNÉES — Annonces
══════════════════════════════════════ */
var props = [];

/* ══════════════════════════════════════
   2. SESSION & COMPTES
══════════════════════════════════════ */
var SK = 'slc_session';
var CK = 'slc_comptes';
var MAX_ATTEMPTS = 5;
var BLOCK_MIN = 15;

function getComptes() { try { return JSON.parse(localStorage.getItem(CK) || '{}'); } catch(e) { return {}; } }
function saveComptes(c) { localStorage.setItem(CK, JSON.stringify(c)); }
function getSession() { try { return JSON.parse(localStorage.getItem(SK) || 'null'); } catch(e) { return null; } }
function saveSession(u) { localStorage.setItem(SK, JSON.stringify(u)); }
function deleteSession() { localStorage.removeItem(SK); }

function majNavAuth() {
  var s = getSession();
  var nav = document.getElementById('nav-auth');
  var comptes = getComptes();
  document.getElementById('stat-users').textContent = Object.keys(comptes).length + '+';

  if (s) {
    var isProprio = s.profil === 'proprio';
    nav.innerHTML =
      '<span class="nav-user-info">' +
        (isProprio ? '<span style="background:var(--orange-l);color:var(--orange);padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:700;margin-right:6px;">PROPRIÉTAIRE</span>' : '') +
        'Bonjour, <strong>' + sanitize(s.prenom) + '</strong>' +
      '</span>' +
      (isProprio
        ? '<button class="btn btn-sm" onclick="showPage(\'dashboard\')" style="font-size:0.78rem;">📊 Mon tableau de bord</button>'
        : '') +
      '<button class="btn btn-sm" onclick="seDeconnecter()">Déconnexion</button>';
  } else {
    nav.innerHTML =
      '<button class="btn" onclick="openModal(\'login\')">Connexion</button>' +
      '<button class="btn btn-primary" onclick="openModal(\'register\')">S\'inscrire</button>';
  }
}

function ouvrirCompte() {
  var s = getSession();
  if (s) {
    if (s.profil === 'proprio') {
      showPage('dashboard');
    } else {
      if (confirm('Bonjour ' + s.prenom + ' !\n\nVoulez-vous vous déconnecter ?')) seDeconnecter();
    }
  } else {
    openModal('login');
  }
}

/* ══════════════════════════════════════
   3. SÉCURITÉ — Helpers
══════════════════════════════════════ */
function sanitize(str) {
  var d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}
function validerEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function validerTel(t) { return /^[\+]?[\d\s\-]{8,15}$/.test(t); }

function evaluerMdp(val) {
  var fill = document.getElementById('pwd-fill');
  var label = document.getElementById('pwd-label');
  var score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  var cfg = [
    {w:'0%', c:'transparent', t:''},
    {w:'25%', c:'#D93A3A', t:'Faible'},
    {w:'50%', c:'#E89A1A', t:'Moyen'},
    {w:'75%', c:'#1A5FA5', t:'Bon'},
    {w:'100%', c:'#1D7A54', t:'Excellent'}
  ];
  var c = cfg[score];
  fill.style.width = c.w;
  fill.style.background = c.c;
  label.textContent = c.t;
  label.style.color = c.c;
}

function togglePwd(id, btn) {
  var inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function showAlert(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
function hideAlert(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ══════════════════════════════════════
   4. INSCRIPTION — Variables
══════════════════════════════════════ */
var codeGenere = '';
var donneesUser = {};
var profilChoisi = '';
var resendTimer = null;
var docsSecurite = { cni: null, justif: null };

/* ══════════════════════════════════════
   5. INSCRIPTION — Étape 0 : Profil
══════════════════════════════════════ */
function choisirProfil(profil) {
  profilChoisi = profil;

  // Highlight selected
  document.querySelectorAll('.profil-card').forEach(function(c) { c.classList.remove('selected'); });
  var selId = 'profil-' + (profil === 'proprio' ? 'proprio' : profil);
  var selEl = document.getElementById(selId);
  if (selEl) selEl.classList.add('selected');

  // Transition après 200ms
  setTimeout(function() {
    document.getElementById('etape-profil').style.display = 'none';
    document.getElementById('etape-formulaire').style.display = 'block';

    // Adapter le titre et indicateur de progression
    var isProprio = profil === 'proprio';
    document.getElementById('reg-title').textContent =
      isProprio ? '🏠 Compte Propriétaire / Bailleur' : (profil === 'acheteur' ? '🛒 Compte Acheteur' : '🔑 Compte Locataire');

    // Indicateur étapes
    var nbSteps = isProprio ? 4 : 3;
    renderStepIndicator('step-indicator', 1, nbSteps);
  }, 150);
}

function retourProfil() {
  document.getElementById('etape-formulaire').style.display = 'none';
  document.getElementById('etape-profil').style.display = 'block';
  profilChoisi = '';
  hideAlert('reg-erreur');
}

function renderStepIndicator(id, current, total) {
  var el = document.getElementById(id);
  if (!el) return;
  var html = '';
  for (var i = 1; i <= total; i++) {
    html += '<div class="step-dot ' + (i <= current ? 'active' : '') + '"></div>';
  }
  el.innerHTML = html;
}

/* ══════════════════════════════════════
   6. INSCRIPTION — Étape 1 : Formulaire
══════════════════════════════════════ */
function envoyerCode() {
  var prenom = document.getElementById('reg-prenom').value.trim();
  var nom = document.getElementById('reg-nom').value.trim();
  var email = document.getElementById('reg-email').value.trim().toLowerCase();
  var tel = document.getElementById('reg-tel').value.trim();
  var mdp = document.getElementById('reg-mdp').value;
  var mdp2 = document.getElementById('reg-mdp2').value;
  var cgu = document.getElementById('reg-cgu').checked;
  var methode = document.querySelector('input[name="verif_methode"]:checked').value;
  hideAlert('reg-erreur');

  if (!prenom || prenom.length < 2) { showAlert('reg-erreur', '⚠️ Prénom invalide (minimum 2 caractères).'); return; }
  if (!nom || nom.length < 2) { showAlert('reg-erreur', '⚠️ Nom invalide (minimum 2 caractères).'); return; }
  if (!validerEmail(email)) { showAlert('reg-erreur', '⚠️ Adresse email invalide.'); return; }
  if (!validerTel(tel)) { showAlert('reg-erreur', '⚠️ Numéro de téléphone invalide.'); return; }
  if (mdp.length < 8) { showAlert('reg-erreur', '⚠️ Mot de passe trop court (min. 8 caractères).'); return; }
  if (mdp !== mdp2) { showAlert('reg-erreur', '⚠️ Les mots de passe ne correspondent pas.'); return; }
  if (!cgu) { showAlert('reg-erreur', "⚠️ Veuillez accepter les conditions d'utilisation."); return; }

  var comptes = getComptes();
  if (comptes[email]) { showAlert('reg-erreur', '⚠️ Un compte existe déjà avec cet email. Connectez-vous.'); return; }

  donneesUser = { prenom, nom, email, tel, mdp, methode, profil: profilChoisi };

  // Si Propriétaire → étape sécurité d'abord
  if (profilChoisi === 'proprio') {
    document.getElementById('etape-formulaire').style.display = 'none';
    document.getElementById('etape-securite').style.display = 'block';
    renderStepIndicator('step-indicator-sec', 2, 4);
    return;
  }

  // Sinon → envoyer le code directement
  _envoyerCodeVerification();
}

function retourFormulaire() {
  document.getElementById('etape-securite').style.display = 'none';
  document.getElementById('etape-formulaire').style.display = 'block';
  hideAlert('sec-erreur');
}

/* ══════════════════════════════════════
   7. INSCRIPTION — Étape 1b : Sécurité Proprio
══════════════════════════════════════ */
function previewDoc(inputId, previewId) {
  var file = document.getElementById(inputId).files[0];
  var prev = document.getElementById(previewId);
  if (!file) return;

  var key = inputId === 'sec-cni-recto' ? 'cni' : 'justif';
  var maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    alert('Fichier trop lourd (max 10 MB).');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    docsSecurite[key] = { name: file.name, data: e.target.result };
    prev.innerHTML = '✅ ' + sanitize(file.name);
  };
  reader.readAsDataURL(file);
}

function validerSecurite() {
  var idNum = document.getElementById('sec-id-num').value.trim();
  var idType = document.getElementById('sec-id-type').value;
  var adresse = document.getElementById('sec-adresse').value.trim();
  hideAlert('sec-erreur');

  if (!idNum) { showAlert('sec-erreur', '⚠️ Veuillez entrer votre numéro de pièce d\'identité.'); return; }
  if (!idType) { showAlert('sec-erreur', '⚠️ Veuillez sélectionner le type de document.'); return; }
  if (!docsSecurite.cni) { showAlert('sec-erreur', '⚠️ Veuillez uploader votre pièce d\'identité (recto).'); return; }
  if (!docsSecurite.justif) { showAlert('sec-erreur', '⚠️ Veuillez uploader un justificatif de propriété.'); return; }
  if (!adresse || adresse.length < 10) { showAlert('sec-erreur', '⚠️ Veuillez entrer l\'adresse complète du bien.'); return; }

  // Sauvegarder les infos de sécurité
  donneesUser.securite = {
    idNum: idNum,
    idType: idType,
    adresse: adresse,
    nbBiens: document.getElementById('sec-nb-biens').value,
    docs: { cni: docsSecurite.cni ? docsSecurite.cni.name : null, justif: docsSecurite.justif ? docsSecurite.justif.name : null }
  };

  // Aller à la vérification par code
  document.getElementById('etape-securite').style.display = 'none';
  _envoyerCodeVerification();
}

/* ══════════════════════════════════════
   8. INSCRIPTION — Envoi code
══════════════════════════════════════ */
function _envoyerCodeVerification() {
  codeGenere = Math.floor(100000 + Math.random() * 900000).toString();
  var btn = document.getElementById('btn-envoyer-code');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Envoi en cours...'; }

  var methode = donneesUser.methode || 'email';

  if (methode === 'email') {
    emailjs.send(EJS_SVC, EJS_TPL, {
      to_name: donneesUser.prenom + ' ' + donneesUser.nom,
      to_email: donneesUser.email,
      code: codeGenere,
      app_name: 'SeLogerChap'
    }).then(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le code de vérification →'; }
      _afficherVerification('email', donneesUser.email);
    }, function(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le code de vérification →'; }
      // En mode démo, on affiche le code
      alert('📧 Mode démo — Code de vérification : ' + codeGenere + '\n\n(Configurez EmailJS pour les vrais emails)');
      _afficherVerification('email', donneesUser.email);
    });
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le code de vérification →'; }
    alert('📱 Mode développement SMS\nCode : ' + codeGenere + '\n\n(Intégrez AfricasTalking pour les vrais SMS)');
    _afficherVerification('sms', donneesUser.tel);
  }
}

function _afficherVerification(methode, dest) {
  // Masquer toutes les étapes
  ['etape-formulaire', 'etape-securite', 'etape-profil'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('etape-verification').style.display = 'block';
  document.getElementById('verif-message').innerHTML =
    methode === 'email'
      ? '📧 Un code à 6 chiffres a été envoyé à <strong>' + sanitize(dest) + '</strong>. Vérifiez aussi vos spams.'
      : '📱 Code envoyé au <strong>' + sanitize(dest) + '</strong>.';
  _demarrerTimer();
}

function _demarrerTimer() {
  var sec = 60;
  var cd = document.getElementById('resend-countdown');
  var btn = document.getElementById('resend-btn');
  if (btn) btn.style.display = 'none';
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(function() {
    sec--;
    if (cd) cd.textContent = 'Renvoi possible dans ' + sec + 's';
    if (sec <= 0) {
      clearInterval(resendTimer);
      if (cd) cd.textContent = '';
      if (btn) btn.style.display = 'inline';
    }
  }, 1000);
}

function retourAvantVerif() {
  document.getElementById('etape-verification').style.display = 'none';
  if (profilChoisi === 'proprio') {
    document.getElementById('etape-securite').style.display = 'block';
  } else {
    document.getElementById('etape-formulaire').style.display = 'block';
  }
  hideAlert('code-erreur');
  if (resendTimer) clearInterval(resendTimer);
}

/* ══════════════════════════════════════
   9. INSCRIPTION — Étape 2 : Vérification code
══════════════════════════════════════ */
function verifierCode() {
  var code = document.getElementById('code-saisi').value.trim();
  hideAlert('code-erreur');
  if (!code) { showAlert('code-erreur', '⚠️ Veuillez entrer le code reçu.'); return; }
  if (code !== codeGenere) { showAlert('code-erreur', '❌ Code incorrect. Réessayez.'); return; }

  sha256(donneesUser.mdp + donneesUser.email).then(function(hash) {
    var comptes = getComptes();
    var isProprio = donneesUser.profil === 'proprio';

    comptes[donneesUser.email] = {
      prenom: donneesUser.prenom,
      nom: donneesUser.nom,
      tel: donneesUser.tel,
      profil: donneesUser.profil,
      hash: hash,
      created: new Date().toISOString(),
      securite: donneesUser.securite || null,
      // Propriétaires : compte en attente de validation
      status: isProprio ? 'pending' : 'active'
    };
    saveComptes(comptes);
    saveSession({
      prenom: donneesUser.prenom,
      nom: donneesUser.nom,
      email: donneesUser.email,
      profil: donneesUser.profil
    });

    closeModal('register');
    _reinitInscription();
    codeGenere = '';
    donneesUser = {};
    docsSecurite = { cni: null, justif: null };
    majNavAuth();
    mettreAJourStats();

    setTimeout(function() {
      if (isProprio) {
        alert(
          '✅ Inscription réussie !\n\n' +
          '🏠 Bienvenue dans l\'espace propriétaire, ' + comptes[Object.keys(comptes)[Object.keys(comptes).length - 1]].prenom + ' !\n\n' +
          '⏳ Votre compte est en cours de vérification (24-48h).\n' +
          'Vous recevrez un email de confirmation une fois votre compte validé.\n\n' +
          'Vous pouvez déjà préparer vos annonces !'
        );
        showPage('dashboard');
      } else {
        alert('✅ Bienvenue sur SeLogerChap !\n\nVotre compte a été créé avec succès. 🎉');
        showPage('listings');
      }
    }, 200);
  });
}

function renvoyerCode() {
  codeGenere = Math.floor(100000 + Math.random() * 900000).toString();
  emailjs.send(EJS_SVC, EJS_TPL, {
    to_name: donneesUser.prenom + ' ' + donneesUser.nom,
    to_email: donneesUser.email,
    code: codeGenere,
    app_name: 'SeLogerChap'
  }).then(function() {
    alert('✅ Nouveau code envoyé à ' + donneesUser.email);
    _demarrerTimer();
  }, function() {
    alert('⚠️ Erreur lors du renvoi. Code actuel (démo) : ' + codeGenere);
    _demarrerTimer();
  });
}

function _reinitInscription() {
  ['etape-profil', 'etape-formulaire', 'etape-securite', 'etape-verification'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = id === 'etape-profil' ? 'block' : 'none';
  });
  document.querySelectorAll('.profil-card').forEach(function(c) { c.classList.remove('selected'); });
  ['reg-prenom','reg-nom','reg-email','reg-tel','reg-mdp','reg-mdp2','code-saisi',
   'sec-id-num','sec-adresse'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var cgu = document.getElementById('reg-cgu');
  if (cgu) cgu.checked = false;
  ['reg-erreur','sec-erreur','code-erreur'].forEach(hideAlert);
  profilChoisi = '';
  if (resendTimer) clearInterval(resendTimer);
}

/* ══════════════════════════════════════
   10. CONNEXION
══════════════════════════════════════ */
function connecterUtilisateur() {
  var email = document.getElementById('login-email').value.trim().toLowerCase();
  var mdp = document.getElementById('login-mdp').value;
  hideAlert('login-erreur');

  if (!validerEmail(email)) { showAlert('login-erreur', '⚠️ Email invalide.'); return; }
  if (!mdp) { showAlert('login-erreur', '⚠️ Entrez votre mot de passe.'); return; }

  var comptes = getComptes();
  var compte = comptes[email];
  if (!compte) { showAlert('login-erreur', '❌ Aucun compte avec cet email. Inscrivez-vous.'); return; }

  var now = Date.now();
  if (compte.blockedUntil && now < compte.blockedUntil) {
    var reste = Math.ceil((compte.blockedUntil - now) / 60000);
    showAlert('login-erreur', '🔒 Compte bloqué. Réessayez dans ' + reste + ' min.');
    return;
  }

  var btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  sha256(mdp + email).then(function(hash) {
    btn.disabled = false;
    btn.textContent = 'Se connecter';

    if (compte.hash !== hash) {
      compte.attempts = (compte.attempts || 0) + 1;
      if (compte.attempts >= MAX_ATTEMPTS) {
        compte.blockedUntil = Date.now() + BLOCK_MIN * 60000;
        compte.attempts = 0;
        showAlert('login-erreur', '🔒 Trop de tentatives. Compte bloqué ' + BLOCK_MIN + ' minutes.');
      } else {
        showAlert('login-erreur', '❌ Mot de passe incorrect. ' + (MAX_ATTEMPTS - compte.attempts) + ' tentative(s) restante(s).');
      }
      saveComptes(comptes);
      return;
    }

    compte.attempts = 0;
    delete compte.blockedUntil;
    compte.lastLogin = new Date().toISOString();
    saveComptes(comptes);
    saveSession({ prenom: compte.prenom, nom: compte.nom, email, profil: compte.profil || 'locataire' });
    document.getElementById('login-email').value = '';
    document.getElementById('login-mdp').value = '';
    closeModal('login');
    majNavAuth();
    mettreAJourStats();

    setTimeout(function() {
      var isProprio = compte.profil === 'proprio';
      if (isProprio) {
        showPage('dashboard');
        alert('✅ Connexion réussie !\n\nBienvenue dans votre espace propriétaire, ' + compte.prenom + ' 👋');
      } else {
        alert('✅ Connexion réussie !\n\nBienvenue ' + compte.prenom + ' ' + compte.nom + ' 👋');
      }
    }, 200);
  });
}

function seDeconnecter() {
  if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
  deleteSession();
  majNavAuth();
  showPage('home');
}

/* ══════════════════════════════════════
   11. PHOTOS — Upload
══════════════════════════════════════ */
var photosSelectionnees = [];

function ajouterPhotos(files) {
  var MAX = 5;
  var MAX_SIZE = 15 * 1024 * 1024;
  Array.from(files).forEach(function(file) {
    if (photosSelectionnees.length >= MAX) { alert('Maximum ' + MAX + ' photos autorisées.'); return; }
    if (!file.type.startsWith('image/')) { alert('Fichier non supporté : ' + file.name); return; }
    if (file.size > MAX_SIZE) { alert('Photo trop lourde : ' + file.name + '. Maximum 15MB.'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      photosSelectionnees.push({ name: file.name, data: e.target.result });
      _afficherPreviews();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('photo-galerie').value = '';
  document.getElementById('photo-camera').value = '';
}

function _afficherPreviews() {
  var zone = document.getElementById('photo-previews');
  zone.innerHTML = photosSelectionnees.map(function(p, i) {
    return '<div class="photo-prev-item">' +
      '<img src="' + p.data + '" alt="Photo ' + (i+1) + '">' +
      '<button class="rm-photo" onclick="supprimerPhoto(' + i + ')">×</button>' +
    '</div>';
  }).join('');
}

function supprimerPhoto(index) {
  photosSelectionnees.splice(index, 1);
  _afficherPreviews();
}

/* ══════════════════════════════════════
   12. PUBLICATION ANNONCE
══════════════════════════════════════ */
function publierAnnonce() {
  var session = getSession();
  if (!session) {
    alert('⚠️ Vous devez être connecté pour publier une annonce.');
    openModal('login');
    return;
  }

  var titre = document.getElementById('pub-titre').value.trim();
  var commune = document.getElementById('commune-input').value.trim();
  var quartier = document.getElementById('pub-quartier').value.trim();
  var desc = document.getElementById('pub-desc').value.trim();
  var prix = document.getElementById('pub-prix').value;
  var nom = document.getElementById('pub-nom').value.trim();
  var tel = document.getElementById('pub-tel').value.trim();
  hideAlert('pub-erreur');

  if (!titre) { showAlert('pub-erreur', '⚠️ Veuillez entrer un titre pour votre annonce.'); return; }
  if (!commune) { showAlert('pub-erreur', '⚠️ Veuillez indiquer la commune ou ville.'); return; }
  if (!desc) { showAlert('pub-erreur', '⚠️ Veuillez décrire votre bien.'); return; }
  if (!prix || parseInt(prix) <= 0) { showAlert('pub-erreur', '⚠️ Veuillez entrer un prix valide.'); return; }
  if (!nom) { showAlert('pub-erreur', '⚠️ Veuillez entrer votre nom complet.'); return; }
  if (!validerTel(tel)) { showAlert('pub-erreur', '⚠️ Numéro de téléphone invalide.'); return; }

  var typeTx = document.getElementById('pub-type-tx').value;
  var typeBien = document.getElementById('pub-type-bien').value;
  var superficie = document.getElementById('pub-superficie').value;
  var pieces = document.getElementById('pub-pieces').value;
  var sdb = document.getElementById('pub-sdb').value;
  var equips = Array.from(document.querySelectorAll('.equip:checked')).map(function(c) { return c.value; });

  // Déterminer la catégorie
  var typeKey = '';
  if (typeBien === 'studio' || typeBien === 'chambre') {
    typeKey = 'studio';
  } else if (typeBien === 'maison') {
    typeKey = typeTx === 'louer' ? 'louer-maison' : 'vendre-maison';
  } else {
    typeKey = typeTx === 'louer' ? 'louer-appart' : 'vendre-appart';
  }

  var icones = { appartement:'🏢', maison:'🏠', studio:'🛏️', chambre:'🛏️' };
  var annonce = {
    id: Date.now(),
    title: sanitize(titre),
    loc: sanitize(commune) + (quartier ? ', ' + sanitize(quartier) : ''),
    price: parseInt(prix).toLocaleString('fr-FR'),
    priceRaw: parseInt(prix),
    unit: typeTx === 'louer' ? '/ mois' : '(à vendre)',
    type: typeKey,
    zone: commune.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'),
    icon: icones[typeBien] || '🏠',
    rooms: pieces === 'Studio' ? 1 : parseInt(pieces) || 1,
    bath: parseInt(sdb) || 1,
    area: parseInt(superficie) || 0,
    new: true,
    equip: equips,
    desc: sanitize(desc),
    photos: photosSelectionnees.slice(),
    contact: { nom: sanitize(nom), tel: sanitize(tel) },
    auteur: session.email,
    date: new Date().toISOString()
  };

  props.unshift(annonce);

  var succEl = document.getElementById('publish-success');
  succEl.style.display = 'block';
  window.scrollTo(0, 0);
  photosSelectionnees = [];
  document.getElementById('photo-previews').innerHTML = '';
  mettreAJourStats();
  renderHome();
  renderDashboard();
}

/* ══════════════════════════════════════
   13. AUTOCOMPLETE COMMUNE
══════════════════════════════════════ */
var COMMUNES = [
  {n:'Cocody',r:'Abidjan'},{n:'Yopougon',r:'Abidjan'},{n:'Marcory',r:'Abidjan'},
  {n:'Plateau',r:'Abidjan'},{n:'Adjamé',r:'Abidjan'},{n:'Abobo',r:'Abidjan'},
  {n:'Treichville',r:'Abidjan'},{n:'Koumassi',r:'Abidjan'},{n:'Port-Bouët',r:'Abidjan'},
  {n:'Attécoubé',r:'Abidjan'},{n:'Bingerville',r:'Abidjan banlieue'},{n:'Anyama',r:'Abidjan banlieue'},
  {n:'Grand-Bassam',r:'Sud-Comoé'},{n:'Bouaké',r:'Vallée du Bandama'},{n:'Daloa',r:'Haut-Sassandra'},
  {n:'San-Pédro',r:'San-Pédro'},{n:'Yamoussoukro',r:'Capitale'},{n:'Korhogo',r:'Poro'},
  {n:'Man',r:'Tonkpi'},{n:'Abengourou',r:'Indénié-Djuablin'},{n:'Gagnoa',r:'Gôh'},
  {n:'Soubré',r:'Nawa'},{n:'Divo',r:'Lôh-Djiboua'},{n:'Agboville',r:'Agnéby-Tiassa'},
  {n:'Bondoukou',r:'Gontougo'},{n:'Séguéla',r:'Worodougou'},{n:'Odienné',r:'Kabadougou'},
  {n:'Ferkessédougou',r:'Hambol'},{n:'Dimbokro',r:"N'Zi"},{n:'Aboisso',r:'Sud-Comoé'},
];

var _acHi = -1;
var _acInp = document.getElementById('commune-input');
var _acDd = document.getElementById('ac-dropdown');
var _acTag = document.getElementById('commune-tag-wrap');

function _norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function _buildDD(q) {
  var res = q ? COMMUNES.filter(function(c) { return _norm(c.n).indexOf(_norm(q)) !== -1; }) : COMMUNES.slice(0, 12);
  _acHi = -1;
  if (!res.length) {
    _acDd.innerHTML = '<div style="padding:0.8rem;color:var(--muted);text-align:center;font-size:0.82rem;font-style:italic">Ville introuvable — saisissez librement</div>';
    _acDd.classList.add('open'); return;
  }
  var abj = res.filter(function(c) { return c.r.indexOf('Abidjan') !== -1; });
  var oth = res.filter(function(c) { return c.r.indexOf('Abidjan') === -1; });
  var html = '';
  if (abj.length) {
    html += '<div class="ac-sep">Abidjan</div>';
    abj.forEach(function(c) { html += '<div class="ac-item" data-n="' + c.n + '">' + c.n + '<span class="ac-region">' + c.r + '</span></div>'; });
  }
  if (oth.length) {
    html += '<div class="ac-sep">Autres villes</div>';
    oth.forEach(function(c) { html += '<div class="ac-item" data-n="' + c.n + '">' + c.n + '<span class="ac-region">' + c.r + '</span></div>'; });
  }
  _acDd.innerHTML = html;
  _acDd.classList.add('open');
  _acDd.querySelectorAll('.ac-item').forEach(function(el) {
    el.addEventListener('mouseover', function() { el.classList.add('hi'); });
    el.addEventListener('mouseout', function() { el.classList.remove('hi'); });
    el.addEventListener('mousedown', function(e) { e.preventDefault(); _choose(el.dataset.n); });
  });
}

function _choose(name) {
  _acInp.value = name;
  _acInp.style.borderColor = 'var(--orange)';
  _acDd.classList.remove('open');
  _acTag.innerHTML = '<span class="commune-tag">📍 ' + sanitize(name) + ' <button type="button" onclick="_clearCommune()">×</button></span>';
}

function _clearCommune() {
  _acInp.value = '';
  _acInp.style.borderColor = '';
  _acTag.innerHTML = '';
  _acInp.focus();
}

if (_acInp) {
  _acInp.addEventListener('input', function() {
    _acTag.innerHTML = '';
    _acInp.style.borderColor = '';
    this.value.trim() ? _buildDD(this.value.trim()) : _acDd.classList.remove('open');
  });
  _acInp.addEventListener('focus', function() { _buildDD(this.value.trim()); });
  _acInp.addEventListener('blur', function() { setTimeout(function() { _acDd.classList.remove('open'); }, 160); });
  _acInp.addEventListener('keydown', function(e) {
    var items = Array.from(_acDd.querySelectorAll('.ac-item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _acHi = Math.min(_acHi + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _acHi = Math.max(_acHi - 1, 0); }
    else if (e.key === 'Enter' && _acHi >= 0) { e.preventDefault(); _choose(items[_acHi].dataset.n); return; }
    else if (e.key === 'Escape') { _acDd.classList.remove('open'); return; }
    items.forEach(function(it, i) { it.classList.toggle('hi', i === _acHi); });
  });
}

/* ══════════════════════════════════════
   14. RECHERCHE & FILTRES
══════════════════════════════════════ */
var searchState = { type: '', lieu: '', min: 0, max: 0 };
var activeFilter = 'all';

function lancerRecherche() {
  searchState.type = document.getElementById('s-type').value;
  searchState.lieu = document.getElementById('s-lieu').value.trim().toLowerCase();
  searchState.min = parseInt(document.getElementById('s-min').value) || 0;
  searchState.max = parseInt(document.getElementById('s-max').value) || 0;
  activeFilter = searchState.type || 'all';
  showPage('listings');
  setTimeout(renderListings, 100);
}

function filtrerProps() {
  var fMin = parseInt(document.getElementById('f-min') ? document.getElementById('f-min').value : 0) || 0;
  var fMax = parseInt(document.getElementById('f-max') ? document.getElementById('f-max').value : 0) || 0;
  return props.filter(function(p) {
    var okType = (activeFilter === 'all') || (p.type === activeFilter) || (p.zone.indexOf(activeFilter) !== -1);
    var okLieu = !searchState.lieu || p.loc.toLowerCase().indexOf(searchState.lieu) !== -1 || p.zone.indexOf(searchState.lieu) !== -1;
    var okMin = !fMin || p.priceRaw >= fMin;
    var okMax = !fMax || p.priceRaw <= fMax;
    return okType && okLieu && okMin && okMax;
  });
}

/* ══════════════════════════════════════
   15. RENDU ANNONCES
══════════════════════════════════════ */
var TYPE_LABELS = {
  'louer-appart': 'À louer',
  'vendre-appart': 'À vendre',
  'louer-maison': 'À louer',
  'vendre-maison': 'À vendre',
  'studio': 'Studio'
};
var TYPE_BADGE = {
  'louer-appart': 'badge-rent',
  'vendre-appart': 'badge-sell',
  'louer-maison': 'badge-rent',
  'vendre-maison': 'badge-sell',
  'studio': 'badge-room'
};

function makeCard(p) {
  var bClass = TYPE_BADGE[p.type] || 'badge-rent';
  var bLabel = TYPE_LABELS[p.type] || 'À louer';
  var imgHtml = p.photos && p.photos.length
    ? '<img src="' + p.photos[0].data + '" alt="' + p.title + '">'
    : '<div class="no-photo">' + p.icon + '</div>';
  return '<div class="prop-card" onclick="openProp(' + p.id + ')">' +
    '<div class="prop-img">' + imgHtml +
      '<span class="prop-badge ' + bClass + '">' + bLabel + '</span>' +
      (p.new ? '<span class="badge-new">Nouveau</span>' : '') +
    '</div>' +
    '<div class="prop-body">' +
      '<div class="prop-title">' + p.title + '</div>' +
      '<div class="prop-loc">📍 ' + p.loc + '</div>' +
      '<div class="prop-price">' + p.price + ' FCFA <span>' + p.unit + '</span></div>' +
      '<div class="prop-feats">' +
        '<span class="feat">🛏 ' + p.rooms + ' pièce' + (p.rooms > 1 ? 's' : '') + '</span>' +
        '<span class="feat">🚿 ' + p.bath + ' sdb</span>' +
        (p.area ? '<span class="feat">📐 ' + p.area + ' m²</span>' : '') +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderHome() {
  var el = document.getElementById('home-listings');
  var recents = props.slice(0, 6);
  el.innerHTML = recents.length
    ? recents.map(makeCard).join('')
    : '<div class="empty-state"><div class="empty-icon">🏠</div><h3>Aucune annonce pour le moment</h3><p>Soyez le premier à publier une annonce !</p><button class="btn btn-primary" onclick="showPage(\'publish\')">Publier maintenant</button></div>';
}

function renderListings() {
  var filtered = filtrerProps();
  var el = document.getElementById('all-listings');
  el.innerHTML = filtered.length
    ? filtered.map(makeCard).join('')
    : '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Aucune annonce trouvée</h3><p>Modifiez vos critères de recherche.</p></div>';
  var rc = document.getElementById('result-count');
  if (rc) rc.textContent = filtered.length + ' annonce' + (filtered.length > 1 ? 's' : '') + ' trouvée' + (filtered.length > 1 ? 's' : '');
}

function renderDashboard() {
  var session = getSession();
  if (!session || session.profil !== 'proprio') return;

  var mesAnnonces = props.filter(function(p) { return p.auteur === session.email; });
  document.getElementById('dash-count-annonces').textContent = mesAnnonces.length;
  document.getElementById('dash-count-vues').textContent = mesAnnonces.length * 12; // simulé
  document.getElementById('dash-count-contacts').textContent = mesAnnonces.length * 3; // simulé
  document.getElementById('dash-count-favoris').textContent = mesAnnonces.length * 5; // simulé

  var el = document.getElementById('mes-annonces-list');
  el.innerHTML = mesAnnonces.length
    ? mesAnnonces.map(makeCard).join('')
    : '<div class="empty-state"><div class="empty-icon">📋</div><h3>Aucune annonce publiée</h3><p>Publiez votre première annonce dès maintenant !</p><button class="btn btn-primary" onclick="showPage(\'publish\')">Publier une annonce</button></div>';

  var session2 = getSession();
  if (session2) {
    document.getElementById('dash-welcome').textContent = 'Bienvenue, ' + session2.prenom + ' — Espace Propriétaire';
  }
}

function mettreAJourStats() {
  document.getElementById('stat-annonces').textContent = props.length + '+';
  var zones = new Set(props.map(function(p) { return p.zone; }));
  document.getElementById('stat-communes').textContent = Math.max(zones.size, 18) + '+';

  var counts = { 'louer-appart':0, 'vendre-appart':0, 'vendre-maison':0, 'louer-maison':0, studio:0 };
  props.forEach(function(p) { if (counts[p.type] !== undefined) counts[p.type]++; });
  document.getElementById('count-louer-appart').textContent = counts['louer-appart'] + ' annonce' + (counts['louer-appart'] > 1 ? 's' : '');
  document.getElementById('count-vendre-appart').textContent = counts['vendre-appart'] + ' annonce' + (counts['vendre-appart'] > 1 ? 's' : '');
  document.getElementById('count-vendre-maison').textContent = counts['vendre-maison'] + ' annonce' + (counts['vendre-maison'] > 1 ? 's' : '');
  document.getElementById('count-louer-maison').textContent = counts['louer-maison'] + ' annonce' + (counts['louer-maison'] > 1 ? 's' : '');
  document.getElementById('count-studio').textContent = counts.studio + ' annonce' + (counts.studio > 1 ? 's' : '');

  var comptes = getComptes();
  document.getElementById('stat-users').textContent = Object.keys(comptes).length + '+';
}

/* ══════════════════════════════════════
   16. DÉTAIL ANNONCE
══════════════════════════════════════ */
function openProp(id) {
  var p = props.find(function(x) { return x.id === id; });
  if (!p) return;
  var msg = '🏠 ' + p.title + '\n' +
    '📍 ' + p.loc + '\n' +
    '💰 ' + p.price + ' FCFA ' + p.unit + '\n' +
    (p.area ? '📐 ' + p.area + ' m²\n' : '') +
    (p.equip && p.equip.length ? '✅ ' + p.equip.join(', ') + '\n' : '') +
    '\n📞 ' + p.contact.nom + ' — ' + p.contact.tel +
    '\n\nAppeler ou contacter via WhatsApp ?';
  if (confirm(msg)) {
    window.location.href = 'tel:' + p.contact.tel.replace(/\s/g, '');
  }
}

/* ══════════════════════════════════════
   17. NAVIGATION
══════════════════════════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  var target = document.getElementById('page-' + name);
  if (!target) return;
  target.classList.add('active');

  // Nav desktop
  var links = document.querySelectorAll('.nav-links a');
  links.forEach(function(a) { a.classList.remove('active'); });
  var map = { home: 0, listings: 1, publish: 2, contact: 3 };
  if (map[name] !== undefined && links[map[name]]) links[map[name]].classList.add('active');

  // Nav mobile
  document.querySelectorAll('.mnav-item').forEach(function(b) { b.classList.remove('active'); });
  var mEl = document.getElementById('mnav-' + name);
  if (mEl) mEl.classList.add('active');

  window.scrollTo(0, 0);

  if (name === 'listings') renderListings();
  if (name === 'dashboard') renderDashboard();
  if (name === 'publish') {
    var succEl = document.getElementById('publish-success');
    if (succEl) succEl.style.display = 'none';
  }
}

function filterAndGo(filter) {
  activeFilter = filter;
  searchState = { type: '', lieu: '', min: 0, max: 0 };
  showPage('listings');
  setTimeout(function() {
    document.querySelectorAll('.chip').forEach(function(c) {
      c.classList.toggle('active', c.dataset.filter === filter);
    });
    renderListings();
  }, 100);
}

document.getElementById('filter-chips').addEventListener('click', function(e) {
  if (e.target.classList.contains('chip')) {
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    renderListings();
  }
});

/* ══════════════════════════════════════
   18. MODALS
══════════════════════════════════════ */
function openModal(name) { document.getElementById('modal-' + name).classList.add('open'); }
function closeModal(name) { document.getElementById('modal-' + name).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(function(m) {
  m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(function(m) { m.classList.remove('open'); });
});

/* ══════════════════════════════════════
   19. FORMULAIRE CONTACT
══════════════════════════════════════ */
function envoyerMessage() {
  var nom = document.getElementById('ct-nom').value.trim();
  var email = document.getElementById('ct-email').value.trim();
  var msg = document.getElementById('ct-msg').value.trim();
  if (!nom || !email || !msg) { alert('⚠️ Veuillez remplir tous les champs.'); return; }
  if (!validerEmail(email)) { alert('⚠️ Email invalide.'); return; }
  var ok = document.getElementById('ct-ok');
  ok.style.display = 'block';
  document.getElementById('ct-nom').value = '';
  document.getElementById('ct-email').value = '';
  document.getElementById('ct-msg').value = '';
}

/* ══════════════════════════════════════
   20. INITIALISATION
══════════════════════════════════════ */
majNavAuth();
renderHome();
renderListings();
mettreAJourStats();