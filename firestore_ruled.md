rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ────────────────────────────────────────────────────────────
    // BASIC IDENTITY
    // ────────────────────────────────────────────────────────────
    function isSignedIn() {
      return request.auth != null;
    }
    function isOwnerUid(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    // ✅ claim-ভিত্তিক admin চেক, ইমেইল-ফলব্যাক শুধু migration সময়ের জন্য।
    // ✅ ফিক্স: 'role' in request.auth.token — নতুন (non-owner) ইউজারের
    // token-এ কোনো custom claim 'role' থাকে না। আগে সরাসরি
    // request.auth.token.role অ্যাক্সেস করলে Firestore rules evaluation
    // error দিত (undefined key access), যেটা ক্লায়েন্টে সরাসরি
    // "permission-denied" হিসেবে প্রকাশ পেত — প্রতিটা নতুন ইউজারের প্রথম
    // লগইনে handleFirstLogin()-এর profile-create ব্যর্থ হচ্ছিল। এখন key
    // না থাকলে নিরাপদে false হয়ে যাবে, error থ্রো করবে না।
    function isAdmin() {
      return isSignedIn() && (
        ('role' in request.auth.token && request.auth.token.role == 'owner')
        || request.auth.token.email == 'nazmul2ahmed@gmail.com'
      );
    }

    // ────────────────────────────────────────────────────────────
    // ✅ [Track A] STAFF / MULTI-TENANT MEMBERSHIP HELPERS
    // ownerUid = /users/{ownerUid}/... পাথের সেই owner, যার ডেটা অ্যাক্সেস
    // করা হচ্ছে। request.auth.uid = প্রকৃত সাইন-ইন করা ইউজার (owner নিজে
    // অথবা তার কোনো staff)।
    // ────────────────────────────────────────────────────────────
    function isActiveStaffWithRole(ownerUid, allowedRoles) {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(ownerUid)/staff/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(ownerUid)/staff/$(request.auth.uid)).data.status == 'active'
        && get(/databases/$(database)/documents/users/$(ownerUid)/staff/$(request.auth.uid)).data.role in allowedRoles;
    }

    // read-access — owner অথবা যেকোনো সক্রিয় স্টাফ (role নির্বিশেষে)।
    // hasAppAccess() ইচ্ছাকৃতভাবে এখানে নেই — revoked/expired হলেও read-only
    // মোডে দেখতে পারার existing নীতি owner ও staff দুজনের জন্যই সমান প্রযোজ্য।
    function isTenantMember(ownerUid) {
      return isOwnerUid(ownerUid) || isActiveStaffWithRole(ownerUid, ['manager', 'cashier']);
    }

    // write-access — owner অথবা নির্দিষ্ট role-এর সক্রিয় স্টাফ, এবং tenant-এর
    // (owner-এর) subscription সক্রিয় থাকতে হবে (staff-এর লেখা অপারেশনও
    // owner-এর ট্রায়াল/সাবস্ক্রিপশন স্ট্যাটাসের ওপর নির্ভরশীল)।
    function canWrite(ownerUid, allowedStaffRoles) {
      return (isOwnerUid(ownerUid) || isActiveStaffWithRole(ownerUid, allowedStaffRoles)) && hasAppAccess(ownerUid);
    }

    // globalMedicines-এর মতো owner-agnostic path-এ request.auth.uid নিজেই
    // owner ধরে hasAppAccess() কল হতো — staff হলে সেটা ভুল হবে (staff-এর
    // নিজের profile-এ ট্রায়াল/সাবস্ক্রিপশন থাকে না)। effectiveTenantUid()
    // স্টাফ হলে তার memberOfOwnerUid, নাহলে নিজের uid রিটার্ন করে।
    function effectiveTenantUid() {
      let myProfile = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return ('memberOfOwnerUid' in myProfile) ? myProfile.memberOfOwnerUid : request.auth.uid;
    }
    function hasAppAccessSelf() {
      return isSignedIn() && hasAppAccess(effectiveTenantUid());
    }

    // ────────────────────────────────────────────────────────────
    // ACCOUNT STATUS & PROFILE FETCH
    // ────────────────────────────────────────────────────────────
    function trialActive(profile) {
      return profile.status == 'trial'
        && profile.createdAt is timestamp
        && request.time < (profile.createdAt + duration.value(15, 'd'));
    }
    function subscriptionActive(profile) {
      return profile.status == 'approved' && (
        !('subscriptionExpiresAt' in profile) ||
        (profile.subscriptionExpiresAt is timestamp && request.time < profile.subscriptionExpiresAt)
      );
    }
    function hasAppAccess(uid) {
      let profile = get(/databases/$(database)/documents/users/$(uid)).data;
      return isAdmin() || trialActive(profile) || subscriptionActive(profile);
    }

    // ✅ AI-A: AI ফিচারের জন্য hasAppAccess()-এর চেয়ে কড়া গার্ড — ট্রায়াল
    // ইচ্ছাকৃতভাবে বাদ (hasAppAccess() trial-কে access দেয়, কিন্তু AI-এর
    // সিদ্ধান্ত ভিন্ন: "ট্রায়ালে AI কোনোভাবেই না")। subscriptionActive()
    // শুধু status=='approved' এবং মেয়াদ-অতিক্রান্ত-না হলে true দেয়।
    function ownerHasPaidAccess(uid) {
      let profile = get(/databases/$(database)/documents/users/$(uid)).data;
      return isAdmin() || subscriptionActive(profile);
    }

    // byokEnabled — admin কর্তৃক এককালীন lifetime আনলক
    // (users/{uid}/config/aiAccess), সাবস্ক্রিপশন-মেয়াদ থেকে স্বতন্ত্র —
    // একবার true হলে ভবিষ্যতে সাবস্ক্রিপশন রিনিউ/এক্সপায়ার হলেও এই ফ্ল্যাগ
    // নিজে বদলায় না (তবে ব্যবহারের জন্য তখনও ownerHasPaidAccess() লাগবে)।
    function byokEnabled(uid) {
      return exists(/databases/$(database)/documents/users/$(uid)/config/aiAccess)
        && get(/databases/$(database)/documents/users/$(uid)/config/aiAccess).data.byokEnabled == true;
    }

    // ────────────────────────────────────────────────────────────
    // VALIDATION HELPERS
    // ────────────────────────────────────────────────────────────
    function isRequired(data, field) {
      return field in data;
    }
    function isNonNegNum(data, field) {
      return !(field in data) || (data[field] is number && data[field] >= 0);
    }
    function isNum(data, field) {
      return !(field in data) || data[field] is number;
    }
    function isStr(data, field) {
      return !(field in data) || data[field] is string;
    }
    function isList(data, field) {
      return !(field in data) || data[field] is list;
    }

    // ════════════════════════════════════════════════════════════
    // USERS (প্রোফাইল)
    // ════════════════════════════════════════════════════════════
    match /users/{uid} {
      // ✅ ফিক্স: active staff-দেরও owner-এর প্রোফাইল পড়ার অনুমতি দরকার —
      // auth.js-এর tenantOwnerUnsub listener owner-এর trial/subscription
      // status থেকে staff-এর readOnly/statusInfo গণনা করে (applyTenantStatus())।
      // আগে শুধু isOwnerUid/isAdmin ছিল, তাই স্টাফ ইনভাইট accept করার পরপরই
      // এই read permission-denied হয়ে "মালিকের প্রোফাইল শোনার সময় সমস্যা"
      // এরর দিত। isActiveStaffWithRole() ব্যবহার করায় owner disable করলে
      // (status:'disabled') এই read-access স্বয়ংক্রিয়ভাবে বন্ধ হয়ে যাবে।
      allow read: if isOwnerUid(uid) || isAdmin() || isActiveStaffWithRole(uid, ['manager', 'cashier']);

      allow create: if isOwnerUid(uid) && (
        ( // সাধারণ owner self-registration — অপরিবর্তিত (বিদ্যমান আচরণ)
          isRequired(request.resource.data, 'email')
          && isRequired(request.resource.data, 'status')
          && request.resource.data.email == request.auth.token.email
          && request.resource.data.status == 'trial'
          && request.resource.data.role == (isAdmin() ? 'owner' : 'user')
          && request.resource.data.createdAt == request.time
        )
        || ( // ✅ staffInviteLookup-ভিত্তিক accept — collectionGroup বাদ,
             // O(1) doc-id lookup দিয়ে ইনভাইটেড স্টাফ নিজের profile তৈরি করছে
          isRequired(request.resource.data, 'email')
          && request.resource.data.email == request.auth.token.email
          && isRequired(request.resource.data, 'memberOfOwnerUid')
          && isRequired(request.resource.data, 'memberRole')
          && request.resource.data.memberRole in ['manager', 'cashier']
          && request.resource.data.status == 'staff'
          && exists(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower()))
          && request.resource.data.memberOfOwnerUid == get(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower())).data.ownerUid
          && request.resource.data.memberRole == get(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower())).data.role
        )
      );

    // ✅ [আইটেম ১৩ - Unsubscribe A] emailPreferences যোগ হলো allowed keys-এ —
  // owner নিজের ইমেইল-প্রেফারেন্স (Settings টগল) বদলাতে পারবেন। map-type
  // চেক যোগ করা হয়েছে যাতে ভুল টাইপের ডেটা না ঢোকে।
      allow update: if (isOwnerUid(uid)
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'photoURL', 'emailPreferences'])
      && (!('emailPreferences' in request.resource.data) || request.resource.data.emailPreferences is map))
    || isAdmin();
    allow delete: if false;
  }

    // ════════════════════════════════════════════════════════════
    // ✅ [Track A] STAFF ROSTER + INVITES
    // ════════════════════════════════════════════════════════════
    match /users/{uid}/staff/{staffUid} {
      allow read: if isOwnerUid(uid) || (isSignedIn() && request.auth.uid == staffUid);

      // owner নিজে staff যোগ/role-পরিবর্তন/disable করছেন
      allow create, update: if isOwnerUid(uid) && hasAppAccess(uid)
        && isRequired(request.resource.data, 'role') && request.resource.data.role in ['manager', 'cashier']
        && isRequired(request.resource.data, 'status') && request.resource.data.status in ['active', 'disabled'];

      // ✅ staffInviteLookup-ভিত্তিক — collectionGroup বাদ। ইনভাইটেড ইউজার
      // নিজে নিজেকে roster-এ register করছে (accept-invite ফ্লো), owner-uid
      // ও role দুটোই lookup doc থেকে verify হচ্ছে O(1) get() দিয়ে।
      allow create: if isSignedIn() && request.auth.uid == staffUid && hasAppAccess(uid)
        && request.resource.data.uid == staffUid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.status == 'active'
        && exists(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower()))
        && uid == get(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower())).data.ownerUid
        && request.resource.data.role == get(/databases/$(database)/documents/staffInviteLookup/$(request.auth.token.email.lower())).data.role;

      allow delete: if isOwnerUid(uid) && hasAppAccess(uid);
    }

    // ✅ ফিক্স: collectionGroup list-rule জটিলতা সম্পূর্ণ বাদ — এখন owner
    // শুধু নিজের UI থেকে normal (non-collectionGroup) subcollection query
    // করে, তাই path-ভিত্তিক isOwnerUid(uid)-ই যথেষ্ট provably-safe।
    // invite-lookup/accept ফ্লো এখন নিচের staffInviteLookup কালেকশন
    // ব্যবহার করে, তাই এখানে আর email-ভিত্তিক read/get লাগে না।
    match /users/{uid}/staffInvites/{email} {
      allow read: if isOwnerUid(uid); // এখন শুধু owner নিজের UI থেকে normal collection query করে, collectionGroup না

      allow create, update: if isOwnerUid(uid) && hasAppAccess(uid)
        && isRequired(request.resource.data, 'email') && request.resource.data.email == email
        && isRequired(request.resource.data, 'role') && request.resource.data.role in ['manager', 'cashier']
        && isRequired(request.resource.data, 'status') && request.resource.data.status == 'pending';

      // owner বাতিল করতে পারবেন, অথবা invited ইউজার নিজে accept করার সময়
      // এই invite doc মুছে (consume করে) দেবে
      allow delete: if isOwnerUid(uid) || (isSignedIn() && email == request.auth.token.email.lower());
    }

    // ════════════════════════════════════════════════════════════
    // ✅ [Track A] STAFF INVITE LOOKUP — collectionGroup query এড়াতে।
    // doc ID = lowercase email, তাই get() দিয়ে O(1) lookup — কোনো list
    // query লাগে না, rule সবসময় provably-safe (শুধু path-var তুলনা)।
    // ════════════════════════════════════════════════════════════
    match /staffInviteLookup/{emailLower} {
      allow get: if isSignedIn() && request.auth.token.email.lower() == emailLower;
      allow create: if isSignedIn() && hasAppAccess(request.auth.uid)
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.role in ['manager', 'cashier'];
      // ✅ শুধু একই owner resend/overwrite করতে পারবে — অন্য owner অন্যজনের
      // পেন্ডিং ইনভাইট hijack করতে পারবে না
      allow update: if isSignedIn() && hasAppAccess(request.auth.uid)
        && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.role in ['manager', 'cashier'];
      allow delete: if isSignedIn() && (
        resource.data.ownerUid == request.auth.uid
        || request.auth.token.email.lower() == emailLower
      );
    }

    // ════════════════════════════════════════════════════════════
    // ✅ [আইটেম ১৩ - Unsubscribe B] EMAIL UNSUBSCRIBE TOKEN DROP-BOX
    // ইমেইলের "unsubscribe" লিংক থেকে unsubscribe.html (কোনো লগইন ছাড়াই)
    // এখানে একটা টোকেন-ডকুমেন্ট ফেলে যায়। শুধু create অনুমোদিত — read/update/
    // delete client-এর জন্য বন্ধ (শুধু Code.gs-এর service account, যেটা rules
    // বাইপাস করে, এটা পড়ে/মুছে ফেলে)। টোকেন cryptographically random এবং
    // শুধু নির্দিষ্ট ইউজারের ইমেইলে পাঠানো হয় — uid ফিল্ড এখানে শুধু
    // রেফারেন্স, প্রকৃত ভ্যালিডেশন Code.gs-এ server-side হয় (stored token
    // বনাম submitted token মিলিয়ে), তাই ভুয়া uid+token জোড়া কার্যকর হবে না।
    // ════════════════════════════════════════════════════════════
    match /unsubscribeRequests/{token} {
      allow create: if isRequired(request.resource.data, 'uid')
        && isStr(request.resource.data, 'uid')
        && request.resource.data.uid.size() > 0
        && isRequired(request.resource.data, 'requestedAt')
        && request.resource.data.keys().hasOnly(['uid', 'requestedAt']);
      allow read, update, delete: if false;
    }

    // প্ল্যাটফর্মের নিজস্ব শেয়ার্ড AI key — শুধু admin
    match /platformConfig/{docId} {
      allow read, write: if isAdmin();
    }
    
    // ════════════════════════════════════════════════════════════
    // GLOBAL MEDICINE MASTER
    // ════════════════════════════════════════════════════════════
    match /globalMedicines/{medId} {
      allow read: if isSignedIn() && hasAppAccessSelf();
      allow write: if isAdmin();
    }

    // ════════════════════════════════════════════════════════════
    // PER-TENANT ডেটা
    // ════════════════════════════════════════════════════════════

    match /users/{uid}/medicines/{medId} {
      allow read: if isTenantMember(uid);
      allow create, update: if canWrite(uid, ['manager'])
        && isRequired(request.resource.data, 'brand')
        && request.resource.data.brand is string
        && request.resource.data.brand.size() > 0
        && isNonNegNum(request.resource.data, 'reorderLevel');
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/inventory/{medId} {
      allow read: if isTenantMember(uid);
      allow create, update: if canWrite(uid, ['manager'])
        && isRequired(request.resource.data, 'totalStock')
        && isNonNegNum(request.resource.data, 'totalStock')
        && isNonNegNum(request.resource.data, 'costValue')
        && isNonNegNum(request.resource.data, 'mrpValue')
        && isNonNegNum(request.resource.data, 'sellPrice')
        && isList(request.resource.data, 'batches');
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/customers/{custId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'name')
        && isStr(request.resource.data, 'name')
        && isNonNegNum(request.resource.data, 'due')
        && isNonNegNum(request.resource.data, 'totalPaid');
      // ✅ [Track A] cashier শুধু due/totalPaid (বাকি আদায়) বদলাতে পারবে,
      // নাম/ফোন/ঠিকানা এডিট বা নতুন ফিল্ড যোগ করতে পারবে না।
      allow update: if (canWrite(uid, ['manager'])
          && isStr(request.resource.data, 'name')
          && isNonNegNum(request.resource.data, 'due')
          && isNonNegNum(request.resource.data, 'totalPaid'))
        || (isActiveStaffWithRole(uid, ['cashier']) && hasAppAccess(uid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['due', 'totalPaid'])
          && isNonNegNum(request.resource.data, 'due')
          && isNonNegNum(request.resource.data, 'totalPaid'));
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/suppliers/{supId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'name')
        && isStr(request.resource.data, 'name')
        && isNonNegNum(request.resource.data, 'totalPayable')
        && isNonNegNum(request.resource.data, 'totalPaid')
        // ✅ ধাপ ৩৩.১ — ঐচ্ছিক ফিল্ড, উপস্থিত থাকলে টাইপ-চেক
        && isStr(request.resource.data, 'supplierCategory')
        && isList(request.resource.data, 'manufacturerNames');
      // ✅ [Track A] cashier শুধু totalPayable/totalPaid (পাওনা পরিশোধ) বদলাতে পারবে
      allow update: if (canWrite(uid, ['manager'])
          && isStr(request.resource.data, 'name')
          && isNonNegNum(request.resource.data, 'totalPayable')
          && isNonNegNum(request.resource.data, 'totalPaid')
          && isStr(request.resource.data, 'supplierCategory')
          && isList(request.resource.data, 'manufacturerNames'))
        || (isActiveStaffWithRole(uid, ['cashier']) && hasAppAccess(uid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['totalPayable', 'totalPaid'])
          && isNonNegNum(request.resource.data, 'totalPayable')
          && isNonNegNum(request.resource.data, 'totalPaid'));
      allow delete: if canWrite(uid, ['manager']);
    }

    // ✅ ধাপ ৩৩.১ — সাপ্লায়ার-প্রতিনিধি (auth-linked ইউজার না, শুধু contact-record)।
    // roster-rule-এর চেয়ে সরল — owner/manager CRUD, tenant member (cashier সহ) read।
    match /users/{uid}/suppliers/{supId}/representatives/{repId} {
      allow read: if isTenantMember(uid);
      allow create, update: if canWrite(uid, ['manager'])
        && isRequired(request.resource.data, 'name')
        && isStr(request.resource.data, 'name')
        && request.resource.data.name.size() > 0
        && isList(request.resource.data, 'groups');
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/sales/{saleId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'invoiceNo')
        && request.resource.data.invoiceNo == saleId
        && isList(request.resource.data, 'items')
        && isNonNegNum(request.resource.data, 'cashPaid')
        && isNonNegNum(request.resource.data, 'due')
        // ✅ [Track A] অডিট-ট্রেইল — কে এই সেল করেছে, delete-permission-এও দরকার
        && isRequired(request.resource.data, 'createdByUid')
        && request.resource.data.createdByUid == request.auth.uid;
      allow update: if false;
      // owner/manager যেকোনো সেল মুছতে পারবে; cashier শুধু নিজের করা এন্ট্রি
      allow delete: if canWrite(uid, ['manager'])
        || (isActiveStaffWithRole(uid, ['cashier']) && hasAppAccess(uid)
          && resource.data.createdByUid == request.auth.uid);
    }

    match /users/{uid}/purchases/{purId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'purchaseId')
        && request.resource.data.purchaseId == purId
        && isList(request.resource.data, 'items')
        && isNonNegNum(request.resource.data, 'totalCost')
        && isRequired(request.resource.data, 'createdByUid')
        && request.resource.data.createdByUid == request.auth.uid;
      allow update: if false;
      allow delete: if canWrite(uid, ['manager'])
        || (isActiveStaffWithRole(uid, ['cashier']) && hasAppAccess(uid)
          && resource.data.createdByUid == request.auth.uid);
    }

    match /users/{uid}/returns/{retId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'returnId')
        && request.resource.data.returnId == retId
        && isList(request.resource.data, 'items')
        && isNonNegNum(request.resource.data, 'amount')
        && isRequired(request.resource.data, 'createdByUid')
        && request.resource.data.createdByUid == request.auth.uid;
      allow update: if false;
      allow delete: if canWrite(uid, ['manager'])
        || (isActiveStaffWithRole(uid, ['cashier']) && hasAppAccess(uid)
          && resource.data.createdByUid == request.auth.uid);
    }

    // ✅ [Track A] Accounts/Expenses — শুধু owner/manager, cashier-এর অ্যাক্সেস নেই
    match /users/{uid}/expenses/{expId} {
      allow read: if isTenantMember(uid);
      allow create, update: if canWrite(uid, ['manager'])
        && isRequired(request.resource.data, 'amount')
        && isNonNegNum(request.resource.data, 'amount');
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/payments/{payId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'amount')
        && isNonNegNum(request.resource.data, 'amount');
      allow update: if false;
      allow delete: if canWrite(uid, ['manager']);
    }

    match /users/{uid}/supplierPayments/{payId} {
      allow read: if isTenantMember(uid);
      allow create: if canWrite(uid, ['manager', 'cashier'])
        && isRequired(request.resource.data, 'amount')
        && isNonNegNum(request.resource.data, 'amount');
      allow update: if false;
      allow delete: if canWrite(uid, ['manager']);
    }

    // ✅ [Track A] Opening Balance — শুধু owner/manager
    match /users/{uid}/openingEntries/{obId} {
      allow read: if isTenantMember(uid);
      allow create, update: if canWrite(uid, ['manager'])
        && isNonNegNum(request.resource.data, 'amount')
        && isNonNegNum(request.resource.data, 'qty');
      allow delete: if canWrite(uid, ['manager']);
    }

    // ✅ [Track A] config: 'balances' ডকুমেন্ট সিস্টেম-লেভেল — প্রতিটা
    // sale/purchase/due-collect ইত্যাদি transaction-এর ভেতর থেকে যেকোনো
    // সক্রিয় tenant member (cashier সহ) আপডেট করবেই করবে। বাকি সব
    // config doc (settings, aiSettings ইত্যাদি) — শুধু owner লিখতে পারবে,
    // Manager/Cashier শুধু read করতে পারবে (Settings ট্যাব read-only)।
    match /users/{uid}/config/{docId} {
      // aiSecret — কোনো client (owner সহ) কখনো read করতে পারবে না।
      // শুধু Apps Script-এর service-account (rules বাইপাস করে) এটা পড়তে পারে।
      allow read: if (docId == 'aiSecret') ? false : (isTenantMember(uid) || isAdmin());

      allow create, update: if
        (docId == 'balances' && isTenantMember(uid) && hasAppAccess(uid))
        // ✅ AI-A: aiSecret — owner নিজে লিখতে পারবে *যদি* paid+byokEnabled হয়,
        // অথবা admin (setup-service — কম টেক-স্যাভি ইউজারের হয়ে key বসিয়ে দেওয়ার জন্য) সবসময় পারবে।
        || (docId == 'aiSecret' && ((isOwnerUid(uid) && ownerHasPaidAccess(uid) && byokEnabled(uid)) || isAdmin()))
        // ✅ AI-A: aiSettings (task-routing/staffAccess) — ট্রায়ালে লেখা যাবে না,
        // admin সবসময় (setup-সহায়তার জন্য) পারবে।
        || (docId == 'aiSettings' && ((isOwnerUid(uid) && ownerHasPaidAccess(uid)) || isAdmin()))
        // ✅ AI-A: aiAccess — byokEnabled টগল, শুধু admin (lifetime unlock গ্র্যান্ট/রিভোক)
        || (docId == 'aiAccess' && isAdmin())
        || (docId == 'aiPremiumAddon' && isAdmin())   // ✅ owner নিজেও এটা বদলাতে পারবে না
        || (docId != 'balances' && docId != 'aiSecret' && docId != 'aiSettings'
            && docId != 'aiAccess' && docId != 'aiPremiumAddon'
            && isOwnerUid(uid) && hasAppAccess(uid))
      ;

      allow delete: if isOwnerUid(uid) && hasAppAccess(uid);
    }
  }
}
