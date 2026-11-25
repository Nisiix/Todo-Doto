# Nouveautés

Traduction française de `CHANGELOG.md` (italien), lue par l'application et par le site. Chaque version ajoute la même section, avec les mêmes points dans le même ordre, aux cinq fichiers (`CHANGELOG.md`, `.en`, `.fr`, `.de`, `.es`) : un test le vérifie.

## 0.7.0 — 21 octobre 2026

- Automatisations (menu de l'espace de travail, administrateurs) : si une tâche urgente reste sans responsable pendant un jour, les administrateurs reçoivent une notification ; si une question reste sans réponse pendant 5 jours, les personnes mentionnées reçoivent un rappel ; quand on confirme une tâche sans échéance, l'application la demande aussitôt. On choisit les jours ; sans serveur, chaque rappel n'arrive qu'une fois.
- Ce qui a changé : on choisit deux moments (les copies de sécurité quotidiennes, ou maintenant) et on voit ce qui a été ajouté, terminé, rouvert, mis à la corbeille ou supprimé, les échéances déplacées « de → à », les tâches passées à d'autres et les projets nouveaux, renommés ou mis à la corbeille. Un clic ouvre la tâche.
- Demander au projet (avec l'IA locale) : des questions comme « qu'avons-nous décidé pour l'authentification ? » ou « quels prérequis faut-il pour le backend ? ». La réponse vient uniquement des tâches, commentaires, questions et décisions, du document d'architecture, des notes de la Stack et des pièces jointes texte ou PDF, et cite ses sources, qui s'ouvrent d'un clic. Rien ne quitte le PC.
- Le détail de la tâche conserve les champs en cours de modification et reçoit les mises à jour des autres.
- Avec le panneau de la tâche ouvert, les boutons en haut du projet n'affichent que leur icône : le nom du projet reste lisible.
- Envoyer un avis (menu de l'espace de travail, palette, écran d'accueil, Paramètres) : signaler un problème, proposer une idée ou poser une question sur GitHub, avec la version déjà remplie, ou écrire à l'auteur par e-mail.
- Avis de nouvelle version : une fois par jour l'application vérifie la dernière version publiée et, s'il y en a une plus récente, l'indique en haut de la fenêtre avec « Nouveautés » et « Télécharger ». On peut vérifier à la main ou le désactiver dans Paramètres › Général.
- Soutenir Todo Doto (menu de l'espace de travail et écran d'accueil) : don avec PayPal ou adresse PayPal à copier.

## 0.6.0 — 20 octobre 2026

- Dépendances : une tâche « vient après » d'autres. Tant que celles-ci ne sont pas terminées, elle porte un cadenas ; si elle arrive à échéance avant ce qui la bloque, un avertissement le signale. Dans le Gantt, des flèches relient les barres et la chaîne critique est mise en évidence. Quand la tâche est débloquée, son responsable reçoit une notification.
- Jalons : versions ou livraisons avec date cible, avancement, filtre et ligne dans le Gantt ; dans la saisie rapide « ~v1.3 ». Une fois le jalon atteint, les notes de version s'écrivent à partir des tâches terminées et se copient ou s'ajoutent au CHANGELOG.md du projet.
- Charge par semaine (Analyse) : échéances et heures estimées de chacun pour les semaines à venir, dans tous les projets, avec les conflits et « Passer à… » avec les personnes conseillées. Estimation en heures dans la tâche ou avec « =3h ».
- Absences et heures hebdomadaires (Membres › Disponibilité) : visibles dans la liste des personnes assignées, elles réduisent la charge et signalent les tâches qui arrivent à échéance pendant l'absence de leur responsable.
- Santé des projets : un anneau jaune ou rouge dans la barre latérale, avec les raisons, et l'évolution semaine par semaine dans Analyse.
- PC prêts : dans Analyse, la matrice projets × personnes avec l'état de chaque PC ; dans la liste des personnes assignées, si le PC de la personne est prêt pour le projet.
- Rapport d'état interne sur une période : terminées, retards, prochaines échéances, jalons, décisions, questions et points d'attention. Il se copie en Markdown, s'enregistre comme page à imprimer en PDF ou s'envoie par e-mail ; l'IA locale peut en rédiger l'introduction.
- Note de passation : en passant une tâche à une autre personne, le détail propose un résumé pour celle qui la reçoit, à ajouter en commentaire.
- Calendriers des échéances (.ics) dans le dossier Données, pour vous et pour chaque projet, à ouvrir dans Outlook ou Thunderbird ; ils s'activent depuis le menu de l'espace de travail.
- Listes de contrôle dans les tâches et répétition hebdomadaire ou mensuelle : en terminant une tâche, la suivante est créée, avec la liste à refaire.
- Modèles de projet : on enregistre un projet comme modèle et on en crée un nouveau avec Stack, dossiers de pièces jointes, jalons et tâches, avec des dates à partir d'aujourd'hui.
- Nettoyage guidé pour les administrateurs : étiquettes jamais utilisées, dossiers vides, projets à l'arrêt, pièces jointes disparues, jalons à clôturer et vieilles corbeilles.

## 0.5.0 — 20 octobre 2026

- Saisie rapide : au-dessus de la liste on écrit « Export CSV !haute @mario #bug avant vendredi » et Entrée crée la tâche avec priorité, personne assignée, étiquette et échéance. Ce qui est reconnu s'affiche avant ; le X le laisse dans le titre. Cela fonctionne aussi dans la boîte « Nouvelle tâche ».
- Aujourd'hui : une page avec ce qui vous concerne dans tous les projets (en retard, à échéance aujourd'hui et cette semaine, urgent, questions qui attendent votre réponse, réponses à vos questions). On termine et on reporte sans ouvrir le projet ; le report ne vaut que pour vous et ne change pas l'échéance.
- Décisions : dans une question, la réponse choisie devient « la décision », avec sa justification. Le projet a son registre des décisions, avec recherche et copie en Markdown.
- Points d'attention et délais : dans le projet, la liste de ce qui se passe mal sans que personne ne l'ait signalé (retards, urgences sans responsable, questions sans réponse, tâches à l'arrêt) et les délais médians de la création à la confirmation et à la fin, avec l'âge des tâches à faire.
- Git par tâche : dans le détail, les commits qui citent TODO-n et le nom de la branche à copier ; la tâche apparaît « en cours » avec des commits récents ou avec sa branche ouverte sur le PC.
- Archives : les tâches terminées depuis plus de 90 jours sont au bas de « Terminées », derrière « Afficher les archives ». La recherche les trouve toujours.
- Palette de commandes : dans Ctrl+K, « > » affiche les commandes (Aujourd'hui, nouvelle tâche, décisions, points d'attention, sections du projet, paramètres…) et « + » ajoute une tâche au projet ouvert.

## 0.4.0 — 20 octobre 2026

- VPN du bureau depuis les paramètres : on choisit un VPN déjà configuré dans Windows et Todo Doto le connecte tout seul quand le dossier partagé ne répond pas (aussi à l'ouverture). Les identifiants restent dans Windows.
- Connexion d'entreprise : avec le compte de domaine (Active Directory ou Microsoft Entra ID), la même personne est le même utilisateur sur n'importe quel PC ; les rôles peuvent venir des groupes Active Directory.
- E-mail et Teams : « Envoyer par e-mail » sur les tâches, la feuille de route et le récapitulatif ; un canal Microsoft Teams par projet avec tâches créées, terminées, assignations, questions et mentions ; e-mail à qui est mentionné ou reçoit une tâche ; le point de la journée chaque matin. Envoi avec l'Outlook du PC ou le serveur SMTP de l'entreprise ; tout est facultatif et choisi par l'administrateur.
- Pensé pour les grandes équipes : historique en fichiers par mois et par PC (plus de fichier unique réécrit par tous), journal des modifications pour savoir quels fichiers relire, contrôle du dossier moins fréquent quand la fenêtre est en arrière-plan ou que l'on est loin du PC, projets de centaines de tâches découpés en chapitres.

## 0.3.0 — 20 octobre 2026

- Todo Doto est gratuit : licences et abonnements sont suspendus. Qui le souhaite peut soutenir le développement par un don PayPal (Paramètres › Général et site).
- Qui travaille sur quoi : dans le détail de la tâche « J'y travaille » ; dans la liste une pastille verte avec qui y travaille, sans décaler les colonnes ; dans la nouvelle Vue d'ensemble, la liste de toute l'équipe.
- Feuille de route pour le client : une page avec ce qui est fait et ce qui arrive, sans descriptions, commentaires ni détails internes, à envoyer ou imprimer en PDF.
- Configurer ce PC : en une seule étape, les programmes nécessaires à tous vos projets, chacun installé une seule fois.
- Stack pas à jour : si les fichiers du projet changent (par ex. une nouvelle version de Node.js), un avis propose de mettre à jour la Stack d'un clic.
- Portable hors du bureau : sans le dossier partagé on continue à travailler sur la copie du PC ; au retour, les modifications sont fusionnées avec celles des collègues, champ par champ, et les conflits sont affichés.
- Chiffrement des données sur le disque pour les espaces de travail réseau (Paramètres › Données utilisateur, administrateurs) : fichiers, copies de sécurité et copie hors du bureau illisibles sans le mot de passe.
- Détection des changements plus légère sur les dossiers réseau : seuls les dossiers modifiés sont interrogés.

## 0.2.26 — 16 octobre 2026

- IA locale, gratuite et entièrement sur le PC (Ollama avec Qwen 3 4B, ou un serveur compatible OpenAI comme LM Studio) : l'application ne communique qu'avec le moteur installé sur le PC, jamais avec des services externes.
- Paramètres › IA locale : test de connexion et téléchargement des modèles avec barre de progression. Dans l'installateur Windows, option facultative pour installer aussi l'IA.
- Stack : « Détecter à partir des fichiers du projet » avec l'IA active propose aussi des prérequis, étapes, variables et notes que les fichiers ne disent pas explicitement, à choisir avant de les ajouter.
- Fonctions assistées : « Comment résoudre » pour les prérequis, tâches à partir d'un texte, avis de tâches similaires, recherche par le sens, commits qui pourraient terminer une tâche, résumé de la semaine, AGENTS.md/CLAUDE.md à partir de la Stack.
- Une bannière en haut invite à activer l'IA locale ; une fois fermée, elle ne revient pas.

## 0.2.25 — 16 octobre 2026

- Dans la barre latérale, les sections du projet sont maintenant dans l'ordre Stack, Todo, Gantt, Pièces jointes.
- Nouveau site : tarifs des offres Free, Team et Business, questions fréquentes, guide d'utilisation, notes de version, comparaisons avec Trello et Excel, pages légales mises à jour.

## 0.2.24 — 15 octobre 2026

- Stack : des champs non valides empêchent l'enregistrement.

## 0.2.23 — 15 octobre 2026

- « Détecter à partir des fichiers du projet » seulement avec un dossier de projet valide.

## 0.2.22 — 15 octobre 2026

- Réouverture du dernier espace de travail sans passer par son choix.

## 0.2.21 — 15 octobre 2026

- Dossier du projet affiché seulement s'il existe vraiment sur ce PC.

## 0.2.20 — 15 octobre 2026

- Filtres du Gantt, échéance non définie, paramètres avec « Données utilisateur ».

## 0.2.19 — 15 octobre 2026

- Dossier du projet sur ce PC, paramètres en onglets.

## 0.2.18 — 15 octobre 2026

- Todo Doto : nouveau nom, Gantt des tâches confirmées, prérequis à partir des fichiers du projet.

## 0.2.17 — 15 octobre 2026

- Commit git → tâche : « ferme TODO-n » termine la tâche.

## 0.2.16 — 15 octobre 2026

- Configuration des PC partagée, notifications réglables, copies de sécurité.

## 0.2.15 — 15 octobre 2026

- Suppressions limitées au dossier Données, messages sur les fichiers du projet.

## 0.2.14 — 14 octobre 2026

- « Mémoriser le mot de passe » au choix, chiffré avec Windows DPAPI.

## 0.2.13 — 14 octobre 2026

- Favoris dans la barre latérale seulement s'il y a des projets étoilés.

## 0.2.12 — 14 octobre 2026

- Liens externes, vérification de .NET et des prérequis hors du PATH, champs de la tâche dans le détail.

## 0.2.11 — 14 octobre 2026

- Projets à partir de leur dossier, stack aussi depuis des dossiers réseau et sous-dossiers, réseau plus rapide.

## 0.2.10 — 14 octobre 2026

- Visibilité des projets publique ou restreinte, avec une pastille dans la barre latérale.

## 0.2.9 — 14 octobre 2026

- Dossiers réseau avec erreurs expliquées, dossier créé avec le projet, import de la stack.

## 0.2.8 — 14 octobre 2026

- Dossier des projets déduit pour les espaces de travail créés avant la 0.2.4.

## 0.2.7 — 14 octobre 2026

- Nom du projet à partir de son dossier, sans modification ultérieure.

## 0.2.6 — 14 octobre 2026

- Gestion des autorisations dans la page Membres, correction de la mise à jour en arrière-plan.

## 0.2.5 — 14 octobre 2026

- GitHub, vérification automatique des prérequis, nom et utilisateurs du projet.

## 0.2.4 — 14 octobre 2026

- Dossier des projets et dossier Données séparés, configuration automatique.

## 0.2.3 — 14 octobre 2026

- Espace de travail à partir d'un dossier de projets existants, avec création automatique des projets.

## 0.2.2 — 14 octobre 2026

- Sections du projet dans la barre latérale, Stack avec import .md et prérequis automatiques.

## 0.2.1 — 14 octobre 2026

- Enregistrements sous verrou entre PC, exe portable sans installateur.

## 0.2.0 — 14 octobre 2026

- Première version publiée avec build automatique, site et installateurs en italien et en anglais.
