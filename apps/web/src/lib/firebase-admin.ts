import * as admin from "firebase-admin"
import path from "path"
import fs from "fs"

function getFirebaseAdmin(): admin.app.App {
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.apps[0]!
  }

  const serviceAccountPath = path.join(process.cwd(), "keys", "roebel-app-146e0-firebase-adminsdk-fbsvc-4f80d78470.json")

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error("Firebase service account key not found")
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"))

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  })
}

export function getMessaging(): admin.messaging.Messaging {
  return getFirebaseAdmin().messaging()
}
