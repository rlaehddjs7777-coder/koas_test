// Run only in an administrator-controlled environment with Application Default Credentials.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
const [projectId,uid]=process.argv.slice(2);
if(!projectId||!uid)throw new Error('Usage: node tools/set-admin.mjs <project-id> <verified-admin-uid>');
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(),user=await auth.getUser(uid);
await auth.setCustomUserClaims(uid,{...user.customClaims,admin:true});
console.log('Admin claim set. The account must sign out and sign in again.');
