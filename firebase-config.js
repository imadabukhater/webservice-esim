// ضع هنا إعدادات مشروع Firebase (انظر دليل SETUP_AR.md).
// طالما القيمة null يعمل التطبيق بوضع تجريبي محلي فقط (بدون مشاركة بين الأجهزة).
window.FIREBASE_CONFIG = null;

// الدخول بحساب Google للوكلاء (اختياري): ضع هنا "Web client ID" من
// Firebase > Authentication > Sign-in method > Google > Web SDK configuration
window.GOOGLE_WEB_CLIENT_ID = '';

// إشعارات المتصفح (Web Push): الصق هنا «Web Push certificates → Key pair» من Firebase > Project settings > Cloud Messaging
window.VAPID_KEY = '';

// منطقة خادم الإشعارات/كلمات المرور (يجب أن تطابق السر FN_REGION في GitHub). الافتراضي us-central1
// window.FN_REGION = 'europe-west1';
// مثال: window.GOOGLE_WEB_CLIENT_ID = '1234567890-abcxyz.apps.googleusercontent.com';
/* مثال:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
*/
