/* Firestore 連線層。資料路徑：classes/{班級代碼}/{stages|props|events}/{id} */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { DEL } from './diff.js?v=202611250452';

export function connect(config, code, h) {
  const app = initializeApp(config);
  // 本機快取：沒網路時仍可看、可改，恢復連線後自動同步
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  for (const name of ['stages', 'props', 'events', 'scenes']) {
    onSnapshot(collection(db, 'classes', code, name),
      snap => h.onData(name, snap.docs.map(d => ({ id: d.id, ...d.data() })), snap.metadata.fromCache),
      err => h.onError(err));
  }
  return {
    write(ops) {
      for (const o of ops) {
        const ref = doc(db, 'classes', code, o.coll, o.id);
        let p;
        if (o.op === 'set') p = setDoc(ref, o.data);
        else if (o.op === 'delete') p = deleteDoc(ref);
        else p = updateDoc(ref, Object.fromEntries(Object.entries(o.data).map(([k, v]) => [k, v === DEL ? deleteField() : v])));
        p.catch(err => h.onError(err));
      }
    },
  };
}
