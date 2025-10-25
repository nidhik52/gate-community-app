**MyGate-Style Community Visitor Management App:**

Welcome to your very own Community Visitor Management System! This app lets Residents pre-authorize visitors, Guards check them in and out at the gate, and Admins oversee everything — all with security, real-time updates, and a smart AI assistant to help.

**Architecture Overview:**

**Frontend:** Built with React, integrating Firebase Authentication for login and Firestore for data storage. It has role-based access control (RBAC), meaning users see and can do only what their role allows.

**Backend:** Node.js & Express server connected to Firebase Admin SDK to manage users and visitor data securely, plus the OpenAI API powers the AI chat assistant.

**Firestore Data:** User profiles, visitor passes, audit logs of actions, and tokens for real-time notifications.

**Roles & What They Can Do:**
**Resident:**	Add visitors, approve or deny visits for their home
**Guard:**    Check visitors in and out at the gate
**Admin:** 	Manage users, view audit logs, and oversee everything


**Features:**
**Visitor Pre-authorization:** Residents can request, approve, or deny visitors.
**Gate Check-in/out:** Guards manage visitor entry and exit.
**Real-time Push Notifications:** Users get updates on visitor status instantly.
**AI Copilot:** Chat naturally with the AI to manage visitors using plain language commands.
**Audit Logs:** Every action is logged for accountability.
**Secure Authentication:** Firebase Authentication with custom roles ensures safe access.

**How to Run Locally:**
1. Clone this repo.
2. Add your Firebase credentials in backend/serviceAccountKey.json.
3. Set your OpenAI API key in your environment variables.
4. Install dependencies (npm install) in both backend and frontend folders.
5. Seed some users and visitors using the seed script (helps you get started quickly).
6. Run backend (node backend/index.js) and frontend (npm run dev in frontend).
7. Visit http://localhost:3000 and start testing!

**Cost Estimate:**
**Mostly low** — Firebase Authentication + Firestore are generous on free tier.
OpenAI API costs depend on usage; this app uses minimal tokens for chatting.
**Typical monthly estimate:** under $10 for small community use.


**Next Steps & Extras (Optional Enhancements):**
1. Amenity/vehicle QR passes
2. Incident reporting and broadcast messaging
3. Offline guard kiosk experience
4. Expanded AI chat commands
