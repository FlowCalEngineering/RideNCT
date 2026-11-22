// Réglages du site RideNCT : modifie ces valeurs à un seul endroit.
window.RIDENCT = {
  email: "contact@ridenct.fr",          // adresse de contact 
  formEndpoint: "",                      // URL d'un service de formulaire (Formspree, Getform...). Vide = ouvre le mail de l'utilisateur.
  androidUrl: "",                        // lien de l'APK ou de la fiche Play Store, quand il existera
  iosUrl: "",                            // lien App Store / TestFlight, quand il existera
  payUrlYear: "https://pay.rev.cat/sandbox/qhvghyobvidmomju/",   // lien d'achat RevenueCat de la formule annuelle (24,99 €/an). Vide = bouton annuel masqué.
  payUrl: "https://pay.rev.cat/sandbox/rmcdybhzhyjszeyo/",   // lien d'achat RevenueCat (web). Vide = abonnement web masqué. Remplacer par le lien de PRODUCTION à la mise en vente.
  payTest: true,                         // true = paiement en mode test (aucun vrai débit). Mettre false avec le lien de production.
  payTesters: ["6b1003bf-f3c0-4c5a-82cc-0bf346ea0ede"],   // comptes pour qui le paiement est ouvert même si payOpen est false (tests). Vider avant la mise en vente.
  payOpen: false,                        // false = abonnement masqué sur le site (avant la sortie). true = boutons « S'abonner » visibles.
  signupOpen: false,                      // false = création de compte fermée sur le site (phase sondage). true = ouverte.
  sondageUrl: "sondage.html",
  supabaseUrl: "https://jpawfdgfggtlqxpbrpnd.supabase.co",
  supabaseKey: "sb_publishable_9glJJ7YBqhQUhT42hQynDg_H_Rng3ac",   // clé publique : sans danger côté site
  editeur: "FlowCal Engineering",
  adresseEditeur: "La Furetais, 44130 Bouvron, France",
  hebergeur: "GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis"
};
