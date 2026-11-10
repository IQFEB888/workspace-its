/**
 * Workspace Data Service
 * Seamlessly manages synchronization between Cloud Firestore and localStorage.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import {
  PageItem,
  MaterialItem,
  ChatMessage,
  SubjectItem,
  UserPreferences,
  SharedRoom,
  SharedRoomMember,
  SharedChatMessage
} from '../types';

export const DEFAULT_SUBJECTS: SubjectItem[] = [
  { id: 'Database', name: 'Database' }
];

export const DEFAULT_PAGES: Record<string, PageItem[]> = {
  Database: [
    {
      id: 'page_default_1',
      name: 'Appunti Principali',
      content: '<h1>Benvenuto nel tuo Workspace ITS</h1><p>I tuoi appunti, materiali e chat AI sono pronti per essere sincronizzati in tempo reale con Firebase Firestore.</p><ul><li>Accedi con il tuo account Google per mantenere i dati sempre al sicuro su tutti i tuoi dispositivi.</li><li>Usa la barra multifunzione in alto per formattare gli appunti o il tasto destro per invocare l\'assistente AI.</li></ul>'
    }
  ]
};

export class WorkspaceService {
  private static localGet<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  private static localSet(key: string, value: any): void {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage set error:', e);
    }
  }

  // Local Storage Getters
  static getLocalPreferences(): UserPreferences {
    return {
      bgIndex: parseInt(localStorage.getItem('workspace_bg_index') || '0', 10),
      isImmersion: localStorage.getItem('workspace_immersion') === 'true',
      isSidebarCollapsed: localStorage.getItem('workspace_sidebar_collapsed') === 'true',
      isChatCollapsed: localStorage.getItem('workspace_chat_collapsed') === 'true',
      activeSubject: localStorage.getItem('workspace_active_subject') || 'Database',
      activePageId: localStorage.getItem('workspace_active_page') || '',
      selectedModel: localStorage.getItem('workspace_gemini_model') || 'gemini-3.8-flash'
    };
  }

  static getLocalSubjects(): SubjectItem[] {
    const pages = this.getLocalPages();
    const driveLinks = this.localGet<Record<string, string>>('workspace_drive_links', {});
    const subjectNames = Object.keys(pages);
    if (subjectNames.length === 0) return DEFAULT_SUBJECTS;

    return subjectNames.map(name => ({
      id: name,
      name,
      driveLink: driveLinks[name] || ''
    }));
  }

  static getLocalPages(): Record<string, PageItem[]> {
    let pages = this.localGet<Record<string, PageItem[]>>('workspace_pages', {});
    const oldNotes = this.localGet<Record<string, string>>('workspace_notes', {});

    // Migration of legacy notes format if needed
    let migrated = false;
    for (const sub in oldNotes) {
      if (!pages[sub] || pages[sub].length === 0) {
        pages[sub] = [
          {
            id: 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            name: 'Appunti Principali',
            content: oldNotes[sub] || ''
          }
        ];
        migrated = true;
      }
    }
    if (Object.keys(pages).length === 0) {
      pages = { ...DEFAULT_PAGES };
      migrated = true;
    }
    if (migrated) {
      this.localSet('workspace_pages', pages);
    }
    return pages;
  }

  static getLocalMaterials(): Record<string, MaterialItem[]> {
    return this.localGet<Record<string, MaterialItem[]>>('workspace_materials', {});
  }

  static getLocalChats(): Record<string, ChatMessage[]> {
    return this.localGet<Record<string, ChatMessage[]>>('workspace_chat_history', {});
  }

  static getLocalApiKeys(): { keys: string[]; selectedIndex: number } {
    return {
      keys: this.localGet<string[]>('workspace_gemini_keys_arr', []),
      selectedIndex: parseInt(localStorage.getItem('workspace_gemini_selected_key_idx') || '0', 10)
    };
  }

  // Save to LocalStorage
  static saveLocalPreferences(pref: Partial<UserPreferences>): void {
    if (pref.bgIndex !== undefined) localStorage.setItem('workspace_bg_index', String(pref.bgIndex));
    if (pref.isImmersion !== undefined) localStorage.setItem('workspace_immersion', String(pref.isImmersion));
    if (pref.isSidebarCollapsed !== undefined) localStorage.setItem('workspace_sidebar_collapsed', String(pref.isSidebarCollapsed));
    if (pref.isChatCollapsed !== undefined) localStorage.setItem('workspace_chat_collapsed', String(pref.isChatCollapsed));
    if (pref.activeSubject !== undefined) localStorage.setItem('workspace_active_subject', pref.activeSubject);
    if (pref.activePageId !== undefined) localStorage.setItem('workspace_active_page', pref.activePageId);
    if (pref.selectedModel !== undefined) localStorage.setItem('workspace_gemini_model', pref.selectedModel);
  }

  static saveLocalPages(pages: Record<string, PageItem[]>): void {
    this.localSet('workspace_pages', pages);
  }

  static saveLocalMaterials(materials: Record<string, MaterialItem[]>): void {
    this.localSet('workspace_materials', materials);
  }

  static saveLocalDriveLinks(links: Record<string, string>): void {
    this.localSet('workspace_drive_links', links);
  }

  static saveLocalChats(chats: Record<string, ChatMessage[]>): void {
    this.localSet('workspace_chat_history', chats);
  }

  static saveLocalApiKeys(keys: string[], selectedIndex: number): void {
    this.localSet('workspace_gemini_keys_arr', keys);
    localStorage.setItem('workspace_gemini_selected_key_idx', String(selectedIndex));
  }

  // ==========================================
  // FIRESTORE CLOUD OPERATIONS (WHEN LOGGED IN)
  // ==========================================

  static subscribeToUserData(
    userId: string,
    callbacks: {
      onPreferences?: (pref: Partial<UserPreferences>) => void;
      onSubjects?: (subjects: SubjectItem[]) => void;
      onPages?: (pagesBySubject: Record<string, PageItem[]>) => void;
      onMaterials?: (materialsBySubject: Record<string, MaterialItem[]>) => void;
      onChats?: (chatsBySubject: Record<string, ChatMessage[]>) => void;
      onKeys?: (keys: string[], selectedIndex: number) => void;
    }
  ): () => void {
    const unsubs: Unsubscribe[] = [];

    // 1. User Root Document (Profile & Preferences)
    const userDocRef = doc(db, 'users', userId);
    unsubs.push(
      onSnapshot(
        userDocRef,
        snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (callbacks.onPreferences) {
              callbacks.onPreferences({
                bgIndex: data.bgIndex,
                isImmersion: data.isImmersion,
                isSidebarCollapsed: data.isSidebarCollapsed,
                isChatCollapsed: data.isChatCollapsed,
                activeSubject: data.activeSubject,
                selectedModel: data.selectedModel
              });
            }
          }
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.GET, `users/${userId}`);
        }
      )
    );

    // 2. Subjects Collection
    const subjectsColRef = collection(db, 'users', userId, 'subjects');
    unsubs.push(
      onSnapshot(
        subjectsColRef,
        snapshot => {
          const subs: SubjectItem[] = [];
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            subs.push({
              id: d.id || docSnap.id,
              name: d.name || docSnap.id,
              driveLink: d.driveLink || ''
            });
          });
          if (callbacks.onSubjects) callbacks.onSubjects(subs);
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/subjects`);
        }
      )
    );

    // 3. Pages Collection
    const pagesColRef = collection(db, 'users', userId, 'pages');
    unsubs.push(
      onSnapshot(
        pagesColRef,
        snapshot => {
          const pagesBySubject: Record<string, PageItem[]> = {};
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const sub = d.subjectId || 'Database';
            if (!pagesBySubject[sub]) pagesBySubject[sub] = [];
            pagesBySubject[sub].push({
              id: d.id || docSnap.id,
              name: d.name || 'Pagina',
              content: d.content || '',
              order: d.order || 0
            });
          });
          // Sort pages by order or id
          for (const s in pagesBySubject) {
            pagesBySubject[s].sort((a, b) => (a.order || 0) - (b.order || 0));
          }
          if (callbacks.onPages) callbacks.onPages(pagesBySubject);
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/pages`);
        }
      )
    );

    // 4. Materials Collection
    const materialsColRef = collection(db, 'users', userId, 'materials');
    unsubs.push(
      onSnapshot(
        materialsColRef,
        snapshot => {
          const matBySubject: Record<string, MaterialItem[]> = {};
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const sub = d.subjectId || 'Database';
            if (!matBySubject[sub]) matBySubject[sub] = [];
            matBySubject[sub].push({
              id: d.id || docSnap.id,
              name: d.name,
              url: d.url,
              category: d.category || 'Lezioni',
              createdAt: d.createdAt,
              fileType: d.fileType || 'link',
              fileSize: d.fileSize || 0,
              mimeType: d.mimeType || '',
              fileData: d.fileData || '',
              hasLocalFile: !!d.hasLocalFile
            });
          });
          if (callbacks.onMaterials) callbacks.onMaterials(matBySubject);
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/materials`);
        }
      )
    );

    // 5. Chats Collection
    const chatsColRef = collection(db, 'users', userId, 'chats');
    unsubs.push(
      onSnapshot(
        chatsColRef,
        snapshot => {
          const chatsBySubject: Record<string, ChatMessage[]> = {};
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const sub = d.subjectId || docSnap.id;
            chatsBySubject[sub] = d.messages || [];
          });
          if (callbacks.onChats) callbacks.onChats(chatsBySubject);
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/chats`);
        }
      )
    );

    // 6. Settings / Keys Document
    const keysDocRef = doc(db, 'users', userId, 'settings', 'keys');
    unsubs.push(
      onSnapshot(
        keysDocRef,
        snapshot => {
          if (snapshot.exists()) {
            const d = snapshot.data();
            if (callbacks.onKeys) {
              callbacks.onKeys(d.keys || [], d.selectedKeyIndex || 0);
            }
          }
        },
        error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.GET, `users/${userId}/settings/keys`);
        }
      )
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }

  // Cloud Write Methods
  static async saveUserPreferencesToCloud(userId: string, pref: Partial<UserPreferences>): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const payload: Record<string, any> = {
        userId,
        updatedAt: new Date().toISOString()
      };
      if (pref.bgIndex !== undefined) payload.bgIndex = pref.bgIndex;
      if (pref.isImmersion !== undefined) payload.isImmersion = pref.isImmersion;
      if (pref.isSidebarCollapsed !== undefined) payload.isSidebarCollapsed = pref.isSidebarCollapsed;
      if (pref.isChatCollapsed !== undefined) payload.isChatCollapsed = pref.isChatCollapsed;
      if (pref.activeSubject !== undefined) payload.activeSubject = pref.activeSubject;
      if (pref.selectedModel !== undefined) payload.selectedModel = pref.selectedModel;

      await setDoc(userDocRef, payload, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
    }
  }

  static async saveSubjectToCloud(userId: string, subject: SubjectItem): Promise<void> {
    try {
      const subjectDocRef = doc(db, 'users', userId, 'subjects', subject.id);
      await setDoc(subjectDocRef, {
        id: subject.id,
        name: subject.name,
        driveLink: subject.driveLink || '',
        userId,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/subjects/${subject.id}`);
    }
  }

  static async deleteSubjectFromCloud(userId: string, subjectId: string): Promise<void> {
    try {
      const subjectDocRef = doc(db, 'users', userId, 'subjects', subjectId);
      await deleteDoc(subjectDocRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${userId}/subjects/${subjectId}`);
    }
  }

  static async savePageToCloud(userId: string, subjectId: string, page: PageItem): Promise<void> {
    try {
      const pageDocRef = doc(db, 'users', userId, 'pages', page.id);
      await setDoc(pageDocRef, {
        id: page.id,
        userId,
        subjectId,
        name: page.name,
        content: page.content,
        order: page.order || 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/pages/${page.id}`);
    }
  }

  static async deletePageFromCloud(userId: string, pageId: string): Promise<void> {
    try {
      const pageDocRef = doc(db, 'users', userId, 'pages', pageId);
      await deleteDoc(pageDocRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${userId}/pages/${pageId}`);
    }
  }

  static async saveMaterialToCloud(userId: string, subjectId: string, material: MaterialItem): Promise<void> {
    try {
      const matIdStr = String(material.id);
      const matDocRef = doc(db, 'users', userId, 'materials', matIdStr);
      // If fileData is large (>500KB), prevent exceeding doc limits by storing metadata and local IndexedDB
      const fileDataToSave = material.fileData && material.fileData.length < 500000 ? material.fileData : '';
      await setDoc(matDocRef, {
        id: matIdStr,
        userId,
        subjectId,
        name: material.name,
        url: material.url,
        category: material.category || 'Lezioni',
        createdAt: material.createdAt || new Date().toISOString(),
        fileType: material.fileType || 'link',
        fileSize: material.fileSize || 0,
        mimeType: material.mimeType || '',
        fileData: fileDataToSave,
        hasLocalFile: !!material.hasLocalFile
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/materials/${material.id}`);
    }
  }

  static async deleteMaterialFromCloud(userId: string, materialId: string | number): Promise<void> {
    try {
      const matIdStr = String(materialId);
      const matDocRef = doc(db, 'users', userId, 'materials', matIdStr);
      await deleteDoc(matDocRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${userId}/materials/${materialId}`);
    }
  }

  static async saveChatToCloud(userId: string, subjectId: string, messages: ChatMessage[]): Promise<void> {
    try {
      const chatDocRef = doc(db, 'users', userId, 'chats', subjectId);
      // Clean up messages to ensure serializable data and bounds
      const cleaned = messages.slice(-20).map(m => ({
        role: m.role,
        parts: (m.parts || []).map(p => ({
          ...(p.text ? { text: p.text } : {}),
          ...(p.inlineData ? { inlineData: p.inlineData } : {})
        }))
      }));
      await setDoc(chatDocRef, {
        id: subjectId,
        subjectId,
        userId,
        messages: cleaned,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/chats/${subjectId}`);
    }
  }

  static async saveApiKeysToCloud(userId: string, keys: string[], selectedIndex: number): Promise<void> {
    try {
      const keysDocRef = doc(db, 'users', userId, 'settings', 'keys');
      await setDoc(keysDocRef, {
        userId,
        keys,
        selectedKeyIndex: selectedIndex,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/settings/keys`);
    }
  }

  // Migrate all existing local data to Firestore for a user
  static async migrateLocalDataToCloud(userId: string): Promise<{ subjectsCount: number; pagesCount: number }> {
    const localSubs = this.getLocalSubjects();
    const localPages = this.getLocalPages();
    const localMaterials = this.getLocalMaterials();
    const localChats = this.getLocalChats();
    const localKeys = this.getLocalApiKeys();
    const localPref = this.getLocalPreferences();

    let pageCount = 0;

    // 1. User preferences
    await this.saveUserPreferencesToCloud(userId, localPref);

    // 2. Subjects
    for (const sub of localSubs) {
      await this.saveSubjectToCloud(userId, sub);
    }

    // 3. Pages
    for (const subName in localPages) {
      const pages = localPages[subName] || [];
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        await this.savePageToCloud(userId, subName, { ...page, order: i });
        pageCount++;
      }
    }

    // 4. Materials
    for (const subName in localMaterials) {
      const items = localMaterials[subName] || [];
      for (const item of items) {
        await this.saveMaterialToCloud(userId, subName, item);
      }
    }

    // 5. Chats
    for (const subName in localChats) {
      const msgs = localChats[subName] || [];
      if (msgs.length > 0) {
        await this.saveChatToCloud(userId, subName, msgs);
      }
    }

    // 6. Keys
    if (localKeys.keys.length > 0) {
      await this.saveApiKeysToCloud(userId, localKeys.keys, localKeys.selectedIndex);
    }

    return { subjectsCount: localSubs.length, pagesCount: pageCount };
  }

  // Check if cloud has data already
  static async checkHasCloudData(userId: string): Promise<boolean> {
    try {
      const pagesSnap = await getDocs(collection(db, 'users', userId, 'pages'));
      return !pagesSnap.empty;
    } catch (e) {
      return false;
    }
  }

  // ==========================================
  // ACCESS APPROVAL & ADMIN GATING
  // ==========================================

  static isSuperAdmin(email?: string | null): boolean {
    return email === 'beccalli.fabio4@gmail.com';
  }

  static async checkUserApproval(userId: string, email?: string | null): Promise<boolean> {
    if (this.isSuperAdmin(email)) return true;
    try {
      const snap = await getDoc(doc(db, 'approved_users', userId));
      return snap.exists() && snap.data().status === 'active';
    } catch (e) {
      return false;
    }
  }

  static async submitAccessRequest(user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }): Promise<void> {
    try {
      const reqRef = doc(db, 'access_requests', user.uid);
      await setDoc(reqRef, {
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Utente',
        photoURL: user.photoURL || '',
        requestedAt: new Date().toISOString(),
        status: 'pending'
      }, { merge: true });
    } catch (e) {
      console.warn('Access request submission:', e);
    }
  }

  static subscribeToAccessRequests(callback: (requests: any[]) => void): Unsubscribe {
    const colRef = collection(db, 'access_requests');
    return onSnapshot(colRef, (snap) => {
      const items: any[] = [];
      snap.forEach(d => items.push(d.data()));
      callback(items);
    }, (err) => console.warn('Access requests listener:', err));
  }

  static subscribeToApprovedUsers(callback: (users: any[]) => void): Unsubscribe {
    const colRef = collection(db, 'approved_users');
    return onSnapshot(colRef, (snap) => {
      const items: any[] = [];
      snap.forEach(d => items.push(d.data()));
      callback(items);
    }, (err) => console.warn('Approved users listener:', err));
  }

  static async approveUserRequest(request: any, adminEmail: string): Promise<void> {
    const approvedRef = doc(db, 'approved_users', request.userId);
    await setDoc(approvedRef, {
      userId: request.userId,
      email: request.email,
      displayName: request.displayName,
      approvedAt: new Date().toISOString(),
      approvedBy: adminEmail,
      status: 'active'
    });
    const reqRef = doc(db, 'access_requests', request.userId);
    await setDoc(reqRef, { status: 'approved' }, { merge: true });
  }

  static async revokeApprovedUser(userId: string): Promise<void> {
    const approvedRef = doc(db, 'approved_users', userId);
    await setDoc(approvedRef, { status: 'revoked' }, { merge: true });
  }

  static async removeApprovedUser(userId: string): Promise<void> {
    const approvedRef = doc(db, 'approved_users', userId);
    await deleteDoc(approvedRef);
    const reqRef = doc(db, 'access_requests', userId);
    await deleteDoc(reqRef).catch(() => {});
  }

  // ==========================================================================
  // SHARED ROOMS & REAL-TIME MULTI-USER COLLABORATION
  // ==========================================================================

  static async createSharedRoom(
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null },
    roomName: string
  ): Promise<SharedRoom> {
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const code = 'ITS-' + Math.floor(1000 + Math.random() * 9000);
    const member: SharedRoomMember = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Studente',
      email: user.email || '',
      photoURL: user.photoURL || '',
      joinedAt: new Date().toISOString()
    };

    const newRoom: SharedRoom = {
      id: roomId,
      name: roomName.trim(),
      code,
      createdBy: user.uid,
      createdByName: member.displayName,
      createdAt: new Date().toISOString(),
      members: {
        [user.uid]: member
      }
    };

    const roomRef = doc(db, 'shared_rooms', roomId);
    await setDoc(roomRef, newRoom);

    // Initial default shared page
    const pageRef = doc(db, 'shared_rooms', roomId, 'pages', 'page_main');
    await setDoc(pageRef, {
      id: 'page_main',
      name: 'Appunti Condivisi',
      content: `<h1>Benvenuti nella Stanza: ${roomName.trim()}</h1><p>Questo è lo spazio di lavoro condiviso. Tutti i partecipanti possono scrivere, formattare gli appunti e fare domande all'AI nella chat laterale in tempo reale!</p>`,
      order: 0,
      updatedAt: new Date().toISOString()
    });

    return newRoom;
  }

  static async joinSharedRoomByCode(
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null },
    codeToSearch: string
  ): Promise<SharedRoom> {
    const cleanCode = codeToSearch.trim().toUpperCase();
    const roomsCol = collection(db, 'shared_rooms');
    const q = query(roomsCol, where('code', '==', cleanCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new Error(`Nessuna stanza trovata con il codice "${cleanCode}". Verifica il codice e riprova.`);
    }

    const roomDoc = snap.docs[0];
    const roomData = roomDoc.data() as SharedRoom;

    const member: SharedRoomMember = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Studente',
      email: user.email || '',
      photoURL: user.photoURL || '',
      joinedAt: new Date().toISOString()
    };

    const updatedMembers = { ...(roomData.members || {}), [user.uid]: member };
    await setDoc(roomDoc.ref, { members: updatedMembers }, { merge: true });

    return { ...roomData, members: updatedMembers };
  }

  static subscribeToUserRooms(
    uid: string,
    callback: (rooms: SharedRoom[]) => void
  ): Unsubscribe {
    const roomsCol = collection(db, 'shared_rooms');
    return onSnapshot(roomsCol, (snap) => {
      if (!auth.currentUser) return;
      const userRooms: SharedRoom[] = [];
      snap.forEach(d => {
        const data = d.data() as SharedRoom;
        if (data.members && data.members[uid]) {
          userRooms.push(data);
        }
      });
      callback(userRooms);
    }, err => {
      if (!auth.currentUser) return;
      console.warn('Rooms listener:', err);
    });
  }

  static subscribeToRoomPages(
    roomId: string,
    callback: (pages: PageItem[]) => void
  ): Unsubscribe {
    const colRef = collection(db, 'shared_rooms', roomId, 'pages');
    return onSnapshot(colRef, (snap) => {
      if (!auth.currentUser) return;
      const pages: PageItem[] = [];
      snap.forEach(d => {
        const data = d.data();
        pages.push({
          id: d.id,
          name: data.name || 'Senza titolo',
          content: data.content || '',
          order: data.order ?? 0
        });
      });
      pages.sort((a, b) => (a.order || 0) - (b.order || 0));
      callback(pages);
    }, err => {
      if (!auth.currentUser) return;
      console.warn('Room pages listener:', err);
    });
  }

  static async saveRoomPage(roomId: string, page: PageItem): Promise<void> {
    const pageRef = doc(db, 'shared_rooms', roomId, 'pages', page.id);
    await setDoc(pageRef, {
      id: page.id,
      name: page.name,
      content: page.content,
      order: page.order ?? 0,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  static async deleteRoomPage(roomId: string, pageId: string): Promise<void> {
    const pageRef = doc(db, 'shared_rooms', roomId, 'pages', pageId);
    await deleteDoc(pageRef);
  }

  static subscribeToRoomMessages(
    roomId: string,
    callback: (messages: SharedChatMessage[]) => void
  ): Unsubscribe {
    const colRef = collection(db, 'shared_rooms', roomId, 'messages');
    const q = query(colRef, orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snap) => {
      if (!auth.currentUser) return;
      const msgs: SharedChatMessage[] = [];
      snap.forEach(d => {
        const data = d.data();
        msgs.push({
          id: d.id,
          role: data.role || 'user',
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto,
          parts: data.parts || [{ text: data.rawText || '' }],
          rawText: data.rawText || (data.parts?.[0]?.text || ''),
          timestamp: data.timestamp || Date.now()
        });
      });
      callback(msgs);
    }, err => {
      if (!auth.currentUser) return;
      console.warn('Room messages listener:', err);
    });
  }

  static async sendRoomMessage(roomId: string, message: SharedChatMessage): Promise<void> {
    const msgRef = doc(db, 'shared_rooms', roomId, 'messages', message.id);
    await setDoc(msgRef, {
      ...message,
      createdAt: new Date().toISOString()
    });
  }

  static subscribeToRoomMaterials(
    roomId: string,
    callback: (materials: MaterialItem[]) => void
  ): Unsubscribe {
    const colRef = collection(db, 'shared_rooms', roomId, 'materials');
    return onSnapshot(colRef, (snap) => {
      if (!auth.currentUser) return;
      const mats: MaterialItem[] = [];
      snap.forEach(d => mats.push(d.data() as MaterialItem));
      callback(mats);
    }, err => {
      if (!auth.currentUser) return;
      console.warn('Room materials listener:', err);
    });
  }

  static async saveRoomMaterial(roomId: string, material: MaterialItem): Promise<void> {
    try {
      const matIdStr = String(material.id);
      const matRef = doc(db, 'shared_rooms', roomId, 'materials', matIdStr);
      const fileDataToSave = material.fileData && material.fileData.length < 500000 ? material.fileData : '';
      await setDoc(matRef, {
        id: matIdStr,
        name: material.name,
        url: material.url,
        category: material.category || 'Lezioni',
        createdAt: material.createdAt || new Date().toISOString(),
        fileType: material.fileType || 'link',
        fileSize: material.fileSize || 0,
        mimeType: material.mimeType || '',
        fileData: fileDataToSave,
        hasLocalFile: !!material.hasLocalFile,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `shared_rooms/${roomId}/materials/${material.id}`);
    }
  }

  static async deleteRoomMaterial(roomId: string, materialId: string | number): Promise<void> {
    try {
      const matRef = doc(db, 'shared_rooms', roomId, 'materials', String(materialId));
      await deleteDoc(matRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `shared_rooms/${roomId}/materials/${materialId}`);
    }
  }

  static async leaveSharedRoom(roomId: string, uid: string): Promise<void> {
    try {
      const roomRef = doc(db, 'shared_rooms', roomId);
      await updateDoc(roomRef, {
        [`members.${uid}`]: deleteField()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `shared_rooms/${roomId}`);
    }
  }

  static async deleteSharedRoom(roomId: string): Promise<void> {
    try {
      // 1. Delete all subcollection docs
      const pagesSnap = await getDocs(collection(db, 'shared_rooms', roomId, 'pages'));
      for (const d of pagesSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }

      const msgsSnap = await getDocs(collection(db, 'shared_rooms', roomId, 'messages'));
      for (const d of msgsSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }

      const matsSnap = await getDocs(collection(db, 'shared_rooms', roomId, 'materials'));
      for (const d of matsSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }

      // 2. Delete the room doc
      await deleteDoc(doc(db, 'shared_rooms', roomId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `shared_rooms/${roomId}`);
    }
  }
}
