'use strict';

const APP_CONFIG = {
  appName: 'MediWorldBD Pharma ERP',
  version: '5.2.0-pwa',

  firebase: {
    apiKey: "AIzaSyCXOLv2PdZNkSv_dYaK7JMdjbfv7XUWjaU",
    authDomain: "mediworld-pharmacy.firebaseapp.com",
    projectId: "mediworld-pharmacy",
    storageBucket: "mediworld-pharmacy.firebasestorage.app",
    messagingSenderId: "223276559077",
    appId: "1:223276559077:web:5968d55dc1fa4a88ce820c"
  },

  ADMIN_EMAIL: 'mediworldbd93@gmail.com',
  SUPPORT_PHONE: '+8801773991062',
  COMPANY_LINKS: {
    website: 'https://mediworldbd.com',
    facebook: '',
  },

  // ✅ আইটেম ৯: About ট্যাবে ক্রস-প্রমোশন — status: 'current' | 'available' | 'coming_soon'
  PRODUCTS: [
    {
      name: 'MediWorldBD Pharma ERP',
      description: 'ফার্মেসি ম্যানেজমেন্ট — POS, ইনভেন্টরি, হিসাব, সব একসাথে।',
      status: 'current',
      url: '',
    },
    // ভবিষ্যতে নতুন প্রোডাক্ট এলে এখানে নতুন এন্ট্রি যোগ করুন, যেমন:
    // { name: 'MediWorldBD ...', description: '...', status: 'coming_soon', url: '' },
  ],
  TRIAL_DAYS: 15,

  features: {
    firebaseAuth: true,
    offlineSync: true,   // ✅ ধাপ ১০-২০: সম্পূর্ণ বাস্তবায়িত ও প্রোডাকশনে স্থিতিশীল
    firestoreDb: true,
  },
};

// ════════════════════════════════════════════════════════════
// FIRESTORE কালেকশন কাঠামো (ডকুমেন্টেশন হিসেবে — কোডে ব্যবহৃত হয় না,
// Firestore schema-less, কিন্তু এই কাঠামো সবসময় অনুসরণ করা হবে)
//
// users/{uid}                          → profile: email, status, role, createdAt
// users/{uid}/medicines/{medId}
// users/{uid}/customers/{custId}
// users/{uid}/suppliers/{supId}
// users/{uid}/inventory/{medId}        → batches[] সহ
// users/{uid}/sales/{saleId}
// users/{uid}/purchases/{purId}
// users/{uid}/returns/{retId}
// users/{uid}/expenses/{expId}
// users/{uid}/payments/{payId}
// users/{uid}/supplierPayments/{payId}
// users/{uid}/openingEntries/{obId}
// users/{uid}/config/settings          → pharmacyName, ownerName, phone, address, lowStockLevel
// ════════════════════════════════════════════════════════════
