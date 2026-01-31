# Firebase Security Setup

## ⚠️ IMPORTANT: Security Warning

Your Firebase credentials are currently visible in the client-side code (`app.js`). While Firebase API keys are designed to be public, you **MUST** implement Firestore Security Rules to protect your data.

---

## 🔒 Required Firestore Security Rules

### Option 1: Public Read/Write (Development Only)

**⚠️ NOT RECOMMENDED FOR PRODUCTION**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /unibridge/{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Option 2: Authenticated Users Only (Recommended)

Requires Firebase Authentication setup.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /unibridge/{document=**} {
      // Only authenticated users can read/write
      allow read, write: if request.auth != null;
    }
  }
}
```

### Option 3: Admin-Only Access (Most Secure)

Requires custom claims or specific user UIDs.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /unibridge/{document=**} {
      // Replace with your admin email or UID
      allow read, write: if request.auth != null && 
                            request.auth.token.email == 'admin@yourdomain.com';
    }
  }
}
```

---

## 📝 How to Apply Security Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **omadbek-ef47a**
3. Navigate to **Firestore Database** in the left sidebar
4. Click on the **Rules** tab
5. Copy and paste one of the rule sets above
6. Click **Publish**

---

## 🔐 Optional: Enable Firebase Authentication

If you want to restrict access to authenticated users only:

1. In Firebase Console, go to **Authentication**
2. Click **Get Started**
3. Choose a sign-in method:
   - **Email/Password** (simplest)
   - **Google Sign-In**
   - **Other providers**

4. Update your `app.js` to include authentication:

```javascript
import { getAuth, signInWithEmailAndPassword } from 
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const auth = getAuth(app);

// Example login
signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
        console.log("User logged in:", userCredential.user);
    })
    .catch((error) => {
        console.error("Login error:", error);
    });
```

---

## 🚨 Security Checklist

- [ ] Security Rules are configured in Firebase Console
- [ ] Rules are tested (use the Rules Playground in Firebase Console)
- [ ] Authentication is enabled (if using Option 2 or 3)
- [ ] Admin users are properly configured
- [ ] API keys are NOT shared publicly in repositories
- [ ] `.env` files are added to `.gitignore` (if using them)

---

## 🔍 Testing Your Rules

1. In Firebase Console → Firestore → Rules tab
2. Click **Rules Playground**
3. Select operation (read/write)
4. Enter document path: `unibridge/TEST_PASSPORT`
5. Simulate authenticated user (if applicable)
6. Click **Run** to test

---

## 📚 Additional Resources

- [Firestore Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Authentication Guide](https://firebase.google.com/docs/auth/web/start)
- [Best Practices for Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)
