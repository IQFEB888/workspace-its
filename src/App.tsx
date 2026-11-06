/**
 * Workspace ITS - Main Application Component
 * Linear/Notion style dashboard with Firebase Cloud Firestore Real-time Sync & Google Auth
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { marked } from 'marked';
import { auth } from './firebase';
import {
  PageItem,
  MaterialItem,
  ChatMessage,
  SubjectItem,
  UserPreferences,
  AttachedFile,
  DialogOptions
} from './types';
import { WorkspaceService, DEFAULT_SUBJECTS, DEFAULT_PAGES } from './services/workspaceService';
import { saveFileToIndexedDB, getFileFromIndexedDB, deleteFileFromIndexedDB } from './services/fileStorage';

const BACKGROUNDS = [
  'url("https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2564")',
  'url("https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2564")',
  'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564")'
];

interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'error';
}

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudSyncActive, setCloudSyncActive] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const activeListenersCleanupRef = useRef<(() => void) | null>(null);

  // Preferences & Layout
  const [bgIndex, setBgIndex] = useState<number>(0);
  const [isImmersion, setIsImmersion] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState<boolean>(false);
  const [isNotesMaximized, setIsNotesMaximized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'materials'>('notes');

  // Time & Date
  const [currentTime, setCurrentTime] = useState<string>('00:00');
  const [currentDate, setCurrentDate] = useState<string>('');

  // Workspace Data
  const [subjects, setSubjects] = useState<SubjectItem[]>(DEFAULT_SUBJECTS);
  const [activeSubject, setActiveSubject] = useState<string>('Database');
  const [driveLink, setDriveLink] = useState<string>('');
  const [pages, setPages] = useState<Record<string, PageItem[]>>(DEFAULT_PAGES);
  const [activePageId, setActivePageId] = useState<string>('');
  const [materials, setMaterials] = useState<Record<string, MaterialItem[]>>({});

  // Gemini Copilot & Keys
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number>(0);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState<string>('');
  const [isAILoading, setIsAILoading] = useState<boolean>(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [lastAIResponse, setLastAIResponse] = useState<string>('');

  // Modals & Popups
  const [isKeysModalOpen, setIsKeysModalOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [modalKeysDraft, setModalKeysDraft] = useState<string[]>([]);
  const [modalSelectedKeyDraft, setModalSelectedKeyDraft] = useState<number>(0);

  // Material Preview & PDF Inspection
  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);

  // AI Chat Active Document Source
  const [chatSelectedMaterial, setChatSelectedMaterial] = useState<MaterialItem | null>(null);

  // Add Material Modal & File Upload State
  const [isAddMaterialModalOpen, setIsAddMaterialModalOpen] = useState<boolean>(false);
  const [addMaterialTab, setAddMaterialTab] = useState<'file' | 'link'>('file');
  const [uploadingFile, setUploadingFile] = useState<{
    name: string;
    originalName: string;
    size: number;
    base64: string;
    mimeType: string;
    fileType: 'pdf' | 'image' | 'doc';
  } | null>(null);
  const [customMaterialName, setCustomMaterialName] = useState<string>('');
  const [customMaterialCategory, setCustomMaterialCategory] = useState<string>('Lezioni');
  const [customMaterialUrl, setCustomMaterialUrl] = useState<string>('');

  // Access Control & Admin Gate
  const [isApproved, setIsApproved] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<any[]>([]);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'requests' | 'approved'>('requests');

  // Universal Dialog State
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    options: DialogOptions;
    fieldValues: Record<string, string>;
    resolver: ((val: any) => void) | null;
  }>({
    isOpen: false,
    options: { title: '' },
    fieldValues: {},
    resolver: null
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    selectedText: string;
    savedRange: Range | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: '',
    savedRange: null
  });

  // Refs
  const notesAreaRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper for Toasts
  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  // Universal Custom Dialog helper
  const openCustomDialog = useCallback((options: DialogOptions): Promise<any> => {
    return new Promise(resolve => {
      const initialFields: Record<string, string> = {};
      if (options.fields) {
        options.fields.forEach((f, idx) => {
          const key = f.id || String(idx);
          initialFields[key] = f.value || '';
        });
      }
      setDialogState({
        isOpen: true,
        options,
        fieldValues: initialFields,
        resolver: resolve
      });
    });
  }, []);

  const closeCustomDialog = (result: any) => {
    if (dialogState.resolver) {
      dialogState.resolver(result);
    }
    setDialogState(prev => ({ ...prev, isOpen: false, resolver: null }));
  };

  const submitCustomDialog = () => {
    if (!dialogState.options.fields || dialogState.options.fields.length === 0) {
      closeCustomDialog(true);
      return;
    }
    if (dialogState.options.fields.length === 1 && !dialogState.options.fields[0].id) {
      closeCustomDialog(dialogState.fieldValues['0'] || '');
    } else {
      closeCustomDialog(dialogState.fieldValues);
    }
  };

  // Clock Update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
      );
      setCurrentDate(
        now.toLocaleDateString('it-IT', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize from LocalStorage first (Fast offline-first render)
  useEffect(() => {
    const localPref = WorkspaceService.getLocalPreferences();
    setBgIndex(localPref.bgIndex);
    setIsImmersion(localPref.isImmersion);
    setIsSidebarCollapsed(localPref.isSidebarCollapsed);
    setIsChatCollapsed(localPref.isChatCollapsed);
    setSelectedModel(localPref.selectedModel);

    const localSubs = WorkspaceService.getLocalSubjects();
    setSubjects(localSubs);
    const initialSub = localSubs.some(s => s.id === localPref.activeSubject)
      ? localPref.activeSubject
      : localSubs[0]?.id || 'Database';
    setActiveSubject(initialSub);

    const activeSubObj = localSubs.find(s => s.id === initialSub);
    setDriveLink(activeSubObj?.driveLink || '');

    const localPages = WorkspaceService.getLocalPages();
    setPages(localPages);
    const subPages = localPages[initialSub] || [];
    const validActivePageId = subPages.some(p => p.id === localPref.activePageId)
      ? localPref.activePageId
      : subPages[0]?.id || '';
    setActivePageId(validActivePageId);

    setMaterials(WorkspaceService.getLocalMaterials());
    setChats(WorkspaceService.getLocalChats());

    const localKeys = WorkspaceService.getLocalApiKeys();
    setApiKeys(localKeys.keys);
    setSelectedKeyIndex(localKeys.selectedIndex);
  }, []);

  // Set Background Image on body
  useEffect(() => {
    document.body.style.backgroundImage = BACKGROUNDS[bgIndex] || BACKGROUNDS[0];
  }, [bgIndex]);

  // Set Full Immersion mode on body
  useEffect(() => {
    if (isImmersion) {
      document.body.classList.add('full-immersion');
    } else {
      document.body.classList.remove('full-immersion');
    }
  }, [isImmersion]);

  // Firebase Auth State Listener & Cloud Sync Setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      // 1. Immediately clean up previous user's listeners to prevent permission-denied errors on teardown
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }

      setCurrentUser(user);
      setAuthLoading(false);

      if (!user) {
        setIsAdmin(false);
        setIsApproved(true);
        setCloudSyncActive(false);
        return;
      }

      const isUserSuperAdmin = WorkspaceService.isSuperAdmin(user.email);
      setIsAdmin(isUserSuperAdmin);

      let userIsApproved = isUserSuperAdmin;
      if (!isUserSuperAdmin) {
        userIsApproved = await WorkspaceService.checkUserApproval(user.uid, user.email);
        if (!userIsApproved) {
          setIsApproved(false);
          setCloudSyncActive(false);
          await WorkspaceService.submitAccessRequest(user);
          return;
        }
      }

      setIsApproved(true);
      setCloudSyncActive(true);
      showToast(`Benvenuto, ${user.displayName || user.email}! Sincronizzazione cloud attiva.`, 'info');

      let unsubAdminReq: (() => void) | null = null;
      let unsubAdminAppr: (() => void) | null = null;

      if (isUserSuperAdmin) {
        unsubAdminReq = WorkspaceService.subscribeToAccessRequests(setAccessRequests);
        unsubAdminAppr = WorkspaceService.subscribeToApprovedUsers(setApprovedUsers);
      }

      // Check if cloud has existing pages; if not, check if local has notes and offer migration
      const hasCloudData = await WorkspaceService.checkHasCloudData(user.uid);
      const localPages = WorkspaceService.getLocalPages();
      const hasLocalData = Object.keys(localPages).some(sub => (localPages[sub] || []).length > 0);

      if (!hasCloudData && hasLocalData) {
        // Offer migration
        const shouldMigrate = await openCustomDialog({
          title: '☁️ Sincronizza Dati Locali',
          description:
            'Abbiamo rilevato i tuoi appunti e corsi locali. Vuoi caricarli sul tuo database Cloud Firestore personale per averli disponibili su tutti i dispositivi?',
          confirmText: 'Sincronizza su Cloud',
          cancelText: 'Più tardi'
        });
        if (shouldMigrate) {
          const result = await WorkspaceService.migrateLocalDataToCloud(user.uid);
          showToast(`Sincronizzati ${result.subjectsCount} corsi e ${result.pagesCount} pagine su Firestore!`);
        }
      }

      // Subscribe to Realtime Firestore updates
      const unsubFirestore = WorkspaceService.subscribeToUserData(user.uid, {
        onPreferences: pref => {
          if (pref.bgIndex !== undefined) setBgIndex(pref.bgIndex);
          if (pref.isImmersion !== undefined) setIsImmersion(pref.isImmersion);
          if (pref.isSidebarCollapsed !== undefined) setIsSidebarCollapsed(pref.isSidebarCollapsed);
          if (pref.isChatCollapsed !== undefined) setIsChatCollapsed(pref.isChatCollapsed);
          if (pref.selectedModel !== undefined) setSelectedModel(pref.selectedModel);
          if (pref.activeSubject !== undefined) {
            setActiveSubject(prev => pref.activeSubject || prev);
          }
        },
        onSubjects: subs => {
          if (subs.length > 0) {
            setSubjects(subs);
            setActiveSubject(prev => (subs.some(s => s.id === prev) ? prev : subs[0].id));
          }
        },
        onPages: pagesBySub => {
          if (Object.keys(pagesBySub).length > 0) {
            setPages(prev => ({ ...prev, ...pagesBySub }));
          }
        },
        onMaterials: matBySub => {
          setMaterials(matBySub);
        },
        onChats: chatsBySub => {
          setChats(chatsBySub);
        },
        onKeys: (keys, idx) => {
          setApiKeys(keys);
          setSelectedKeyIndex(idx);
        }
      });

      activeListenersCleanupRef.current = () => {
        unsubFirestore();
        if (unsubAdminReq) unsubAdminReq();
        if (unsubAdminAppr) unsubAdminAppr();
      };
    });

    return () => {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      unsubscribe();
    };
  }, [openCustomDialog, showToast]);

  // Sync active page content into editor whenever activePageId or activeSubject changes
  useEffect(() => {
    const currentSubPages = pages[activeSubject] || [];
    let currentPage = currentSubPages.find(p => p.id === activePageId);
    if (!currentPage && currentSubPages.length > 0) {
      currentPage = currentSubPages[0];
      setActivePageId(currentPage.id);
    }
    if (notesAreaRef.current) {
      notesAreaRef.current.innerHTML = currentPage ? currentPage.content : '';
    }
    // Update drive link for active subject
    const currentSub = subjects.find(s => s.id === activeSubject);
    setDriveLink(currentSub?.driveLink || '');
  }, [activeSubject, activePageId, pages, subjects]);

  // Scroll chat messages to bottom on new message or tab opening
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chats, activeSubject, isChatCollapsed]);

  // Google Login Handler
  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed or cancelled the popup — expected user action, handle gracefully without console.error
        console.info('Google sign-in popup was closed by user.');
        showToast('Accesso annullato.', 'info');
      } else if (code === 'auth/unauthorized-domain') {
        console.error('Google Sign In Error:', error);
        showToast('Dominio non autorizzato! Aggiungi "iqfeb888.github.io" nei Domini autorizzati su Firebase Console.', 'error');
      } else if (code === 'auth/operation-not-allowed') {
        console.error('Google Sign In Error:', error);
        showToast('Provider Google non abilitato! Abilitalo in Firebase Console > Authentication > Sign-in method.', 'error');
      } else if (code === 'auth/popup-blocked') {
        console.warn('Google sign-in popup was blocked by browser.');
        showToast('Finestra popup bloccata dal browser. Consenti i popup per accedere con Google.', 'error');
      } else {
        console.error('Google Sign In Error:', error);
        showToast(`Errore accesso (${code || 'sconosciuto'}): ${error?.message || 'Riprova'}`, 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = await openCustomDialog({
      title: 'Disconnessione',
      description: 'Vuoi disconnetterti dal tuo account Google?',
      confirmText: 'Esci',
      danger: true
    });
    if (confirmed) {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      await signOut(auth);
      showToast('Disconnesso con successo.');
    }
  };

  // Background toggle
  const handleChangeBackground = () => {
    const nextIdx = (bgIndex + 1) % BACKGROUNDS.length;
    setBgIndex(nextIdx);
    WorkspaceService.saveLocalPreferences({ bgIndex: nextIdx });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { bgIndex: nextIdx });
    }
  };

  // Focus mode toggle
  const handleToggleImmersion = () => {
    const nextState = !isImmersion;
    setIsImmersion(nextState);
    WorkspaceService.saveLocalPreferences({ isImmersion: nextState });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { isImmersion: nextState });
    }
  };

  // Sidebar toggle
  const handleToggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    WorkspaceService.saveLocalPreferences({ isSidebarCollapsed: nextState });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { isSidebarCollapsed: nextState });
    }
  };

  // Chat panel toggle
  const handleToggleChat = () => {
    const nextState = !isChatCollapsed;
    setIsChatCollapsed(nextState);
    WorkspaceService.saveLocalPreferences({ isChatCollapsed: nextState });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { isChatCollapsed: nextState });
    }
  };

  // Fullscreen notes
  const handleToggleFullscreenNotes = () => {
    setIsNotesMaximized(prev => !prev);
  };

  // Subject change
  const handleSelectSubject = (newSubject: string) => {
    setActiveSubject(newSubject);
    WorkspaceService.saveLocalPreferences({ activeSubject: newSubject });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { activeSubject: newSubject });
    }
    const subPages = pages[newSubject] || [];
    if (subPages.length > 0) {
      setActivePageId(subPages[0].id);
    } else {
      setActivePageId('');
    }
  };

  // Add New Subject
  const handleAddNewSubject = async () => {
    const newSubName = await openCustomDialog({
      title: '📚 Nuova Materia',
      description: 'Inserisci il nome del nuovo corso o materia da aggiungere al tuo workspace.',
      fields: [{ placeholder: 'Es. Sistemi Cloud, Cybersecurity...', value: '' }],
      confirmText: 'Crea Materia'
    });

    if (newSubName && newSubName.trim()) {
      const cleanSub = newSubName.trim();
      if (subjects.some(s => s.id === cleanSub)) {
        showToast('Questa materia esiste già!', 'error');
        return;
      }
      const newSubItem: SubjectItem = { id: cleanSub, name: cleanSub, driveLink: '' };
      const newPage: PageItem = {
        id: 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: 'Appunti Principali',
        content: '',
        order: 0
      };

      const updatedSubs = [...subjects, newSubItem];
      const updatedPages = { ...pages, [cleanSub]: [newPage] };

      setSubjects(updatedSubs);
      setPages(updatedPages);
      setActiveSubject(cleanSub);
      setActivePageId(newPage.id);

      WorkspaceService.saveLocalPages(updatedPages);
      WorkspaceService.saveLocalPreferences({ activeSubject: cleanSub, activePageId: newPage.id });

      if (currentUser) {
        await WorkspaceService.saveSubjectToCloud(currentUser.uid, newSubItem);
        await WorkspaceService.savePageToCloud(currentUser.uid, cleanSub, newPage);
        await WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, {
          activeSubject: cleanSub,
          activePageId: newPage.id
        });
      }
      showToast(`Materia "${cleanSub}" creata con successo!`);
    }
  };

  // Delete Subject with Cascade Cleanup
  const handleDeleteSubject = async (subjectToDelete: string) => {
    if (subjects.length <= 1) {
      showToast("Non puoi eliminare l'unica materia rimasta! Creane prima un'altra con '+ Nuova' per poter eliminare questa.", 'error');
      return;
    }

    const confirmed = await openCustomDialog({
      title: '🗑️ Elimina Materia',
      description: `Sei sicuro di voler eliminare la materia <b>"${subjectToDelete}"</b>?<br/><br/><span style="color: #ef4444; font-size: 0.82rem;">⚠️ Verranno rimossi tutti gli appunti, le pagine e i materiali di questo corso.</span>`,
      confirmText: 'Elimina Definitivamente',
      danger: true
    });

    if (!confirmed) return;

    // Determine the next active subject
    const remainingSubjects = subjects.filter(s => s.id !== subjectToDelete);
    const nextSubject = remainingSubjects[0].id;

    // Clean up local pages, materials, and chats
    const updatedPages = { ...pages };
    delete updatedPages[subjectToDelete];

    const updatedMaterials = { ...materials };
    delete updatedMaterials[subjectToDelete];

    const updatedChats = { ...chats };
    delete updatedChats[subjectToDelete];

    const nextPages = updatedPages[nextSubject] || [];
    const nextActivePageId = nextPages.length > 0 ? nextPages[0].id : '';

    setSubjects(remainingSubjects);
    setPages(updatedPages);
    setMaterials(updatedMaterials);
    setChats(updatedChats);
    setActiveSubject(nextSubject);
    setActivePageId(nextActivePageId);

    if (chatSelectedMaterial && (materials[subjectToDelete] || []).some(m => m.id === chatSelectedMaterial.id)) {
      setChatSelectedMaterial(null);
    }

    // Save to local storage
    WorkspaceService.saveLocalPages(updatedPages);
    WorkspaceService.saveLocalMaterials(updatedMaterials);
    WorkspaceService.saveLocalPreferences({
      activeSubject: nextSubject,
      activePageId: nextActivePageId
    });

    // Cloud Firestore deletion
    if (currentUser) {
      await WorkspaceService.deleteSubjectFromCloud(currentUser.uid, subjectToDelete);

      // Clean up pages for this subject in cloud
      const oldPages = pages[subjectToDelete] || [];
      for (const p of oldPages) {
        await WorkspaceService.deletePageFromCloud(currentUser.uid, p.id);
      }

      // Clean up materials for this subject in cloud
      const oldMats = materials[subjectToDelete] || [];
      for (const m of oldMats) {
        await WorkspaceService.deleteMaterialFromCloud(currentUser.uid, m.id);
      }

      await WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, {
        activeSubject: nextSubject,
        activePageId: nextActivePageId
      });
    }

    showToast(`Materia "${subjectToDelete}" eliminata con successo.`);
  };

  // Save current note content (debounced to cloud, instant to local)
  const handleEditorInput = () => {
    if (!notesAreaRef.current) return;
    const content = notesAreaRef.current.innerHTML;

    // Update local state immediately
    setPages(prev => {
      const currentSubPages = prev[activeSubject] || [];
      const updated = currentSubPages.map(p => (p.id === activePageId ? { ...p, content } : p));
      const nextPages = { ...prev, [activeSubject]: updated };
      WorkspaceService.saveLocalPages(nextPages);
      return nextPages;
    });

    // Debounce cloud write to Firestore
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (currentUser && activePageId) {
        const page = (pages[activeSubject] || []).find(p => p.id === activePageId);
        if (page) {
          await WorkspaceService.savePageToCloud(currentUser.uid, activeSubject, {
            ...page,
            content
          });
        }
      }
    }, 600);
  };

  // Drive link update
  const handleDriveLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const link = e.target.value.trim();
    setDriveLink(link);
    setSubjects(prev =>
      prev.map(s => (s.id === activeSubject ? { ...s, driveLink: link } : s))
    );
    const links: Record<string, string> = WorkspaceService.getLocalSubjects().reduce(
      (acc: Record<string, string>, s) => ({ ...acc, [s.id]: s.driveLink || '' }),
      {}
    );
    links[activeSubject] = link;
    WorkspaceService.saveLocalDriveLinks(links);

    if (currentUser) {
      const sub = subjects.find(s => s.id === activeSubject);
      if (sub) {
        WorkspaceService.saveSubjectToCloud(currentUser.uid, { ...sub, driveLink: link });
      }
    }
  };

  const handleOpenDrive = () => {
    if (driveLink) {
      window.open(driveLink, '_blank');
    } else {
      showToast('Nessun link Drive inserito per questa materia.', 'error');
    }
  };

  // Add New Page in active subject
  const handleAddNewPage = async () => {
    const currentSubPages = pages[activeSubject] || [];
    const pageName = await openCustomDialog({
      title: '📝 Nuova Pagina Appunti',
      description: `Crea una nuova scheda di appunti in <b>${activeSubject}</b>.`,
      fields: [{ placeholder: 'Titolo della pagina...', value: `Pagina ${currentSubPages.length + 1}` }],
      confirmText: 'Crea Pagina'
    });

    if (pageName && pageName.trim()) {
      const newPage: PageItem = {
        id: 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: pageName.trim(),
        content: '',
        order: currentSubPages.length
      };

      const updated = {
        ...pages,
        [activeSubject]: [...currentSubPages, newPage]
      };
      setPages(updated);
      setActivePageId(newPage.id);
      WorkspaceService.saveLocalPages(updated);
      WorkspaceService.saveLocalPreferences({ activePageId: newPage.id });

      if (currentUser) {
        await WorkspaceService.savePageToCloud(currentUser.uid, activeSubject, newPage);
      }
      showToast(`Pagina "${pageName.trim()}" creata!`);
    }
  };

  // Delete Page
  const handleDeletePage = async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSubPages = pages[activeSubject] || [];
    if (currentSubPages.length <= 1) {
      showToast("Impossibile eliminare l'unica pagina rimasta.", 'error');
      return;
    }
    const targetPage = currentSubPages.find(p => p.id === pageId);
    const confirmed = await openCustomDialog({
      title: '🗑️ Elimina Pagina',
      description: `Vuoi davvero eliminare la pagina <b>"${targetPage?.name || ''}"</b>? L'azione non è reversibile.`,
      confirmText: 'Elimina Pagina',
      danger: true
    });

    if (confirmed) {
      const filtered = currentSubPages.filter(p => p.id !== pageId);
      const updated = { ...pages, [activeSubject]: filtered };
      setPages(updated);
      WorkspaceService.saveLocalPages(updated);

      if (activePageId === pageId) {
        setActivePageId(filtered[0]?.id || '');
      }

      if (currentUser) {
        await WorkspaceService.deletePageFromCloud(currentUser.uid, pageId);
      }
      showToast('Pagina eliminata.');
    }
  };

  // Rename Page
  const handleRenamePage = async (pageId: string) => {
    const currentSubPages = pages[activeSubject] || [];
    const page = currentSubPages.find(p => p.id === pageId);
    if (!page) return;

    const newName = await openCustomDialog({
      title: '✏️ Rinomina Pagina',
      description: 'Inserisci il nuovo titolo per questa scheda di appunti.',
      fields: [{ placeholder: 'Titolo pagina...', value: page.name }],
      confirmText: 'Salva'
    });

    if (newName && newName.trim()) {
      const updatedPages = currentSubPages.map(p =>
        p.id === pageId ? { ...p, name: newName.trim() } : p
      );
      const nextPages = { ...pages, [activeSubject]: updatedPages };
      setPages(nextPages);
      WorkspaceService.saveLocalPages(nextPages);

      if (currentUser) {
        await WorkspaceService.savePageToCloud(currentUser.uid, activeSubject, {
          ...page,
          name: newName.trim()
        });
      }
      showToast('Pagina rinominata!');
    }
  };

  // Rich Text Formatting helper
  const handleFormatText = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (notesAreaRef.current) {
      notesAreaRef.current.focus();
    }
    handleEditorInput();
  };

  // Materials: Open Add Modal
  const handleOpenAddMaterialModal = () => {
    setUploadingFile(null);
    setCustomMaterialName('');
    setCustomMaterialUrl('');
    setCustomMaterialCategory('Lezioni');
    setAddMaterialTab('file');
    setIsAddMaterialModalOpen(true);
  };

  // Materials: File Upload Handler
  const handleMaterialFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      showToast('Il file supera i 25MB. Ti consigliamo di caricarlo su Google Drive e incollare il link.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');
      const cleanName = file.name.replace(/\.[^/.]+$/, '');

      setUploadingFile({
        name: cleanName,
        originalName: file.name,
        size: file.size,
        base64: base64Url,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
        fileType: isPdf ? 'pdf' : isImg ? 'image' : 'doc'
      });
      if (!customMaterialName) {
        setCustomMaterialName(cleanName);
      }
    };
    reader.readAsDataURL(file);
  };

  // Materials: Save Resource (File or Link)
  const handleSaveMaterial = async () => {
    if (addMaterialTab === 'file') {
      if (!uploadingFile) {
        showToast('Seleziona prima un file da caricare.', 'error');
        return;
      }
      const matId = 'mat_' + Date.now();
      const name = customMaterialName.trim() || uploadingFile.name;
      const newMaterial: MaterialItem = {
        id: matId,
        name,
        url: uploadingFile.base64.length < 500000 ? uploadingFile.base64 : 'local_storage',
        category: (customMaterialCategory || 'Lezioni').trim(),
        createdAt: new Date().toISOString(),
        fileType: uploadingFile.fileType,
        fileSize: uploadingFile.size,
        mimeType: uploadingFile.mimeType,
        fileData: uploadingFile.base64.length < 500000 ? uploadingFile.base64 : '',
        hasLocalFile: true
      };

      // Store in IndexedDB for offline & preview availability
      await saveFileToIndexedDB(matId, uploadingFile.base64);

      const currentSubMaterials = materials[activeSubject] || [];
      const updated = {
        ...materials,
        [activeSubject]: [...currentSubMaterials, newMaterial]
      };
      setMaterials(updated);
      WorkspaceService.saveLocalMaterials(updated);

      if (currentUser) {
        await WorkspaceService.saveMaterialToCloud(currentUser.uid, activeSubject, newMaterial);
      }
      setIsAddMaterialModalOpen(false);
      setUploadingFile(null);
      showToast(`Documento "${newMaterial.name}" salvato!`);
    } else {
      // Link Tab
      if (!customMaterialName.trim() || !customMaterialUrl.trim()) {
        showToast('Inserisci sia il nome che il link.', 'error');
        return;
      }
      let url = customMaterialUrl.trim();
      const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch && driveMatch[1]) {
        url = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }
      const isDrive = url.includes('drive.google.com');
      const isPdf = url.toLowerCase().includes('.pdf');
      const matId = 'mat_' + Date.now();
      const newMaterial: MaterialItem = {
        id: matId,
        name: customMaterialName.trim(),
        url,
        category: (customMaterialCategory || 'Lezioni').trim(),
        createdAt: new Date().toISOString(),
        fileType: isDrive ? 'link' : isPdf ? 'pdf' : 'link',
        hasLocalFile: false
      };

      const currentSubMaterials = materials[activeSubject] || [];
      const updated = {
        ...materials,
        [activeSubject]: [...currentSubMaterials, newMaterial]
      };
      setMaterials(updated);
      WorkspaceService.saveLocalMaterials(updated);

      if (currentUser) {
        await WorkspaceService.saveMaterialToCloud(currentUser.uid, activeSubject, newMaterial);
      }
      setIsAddMaterialModalOpen(false);
      showToast(`Risorsa "${newMaterial.name}" salvata!`);
    }
  };

  // Materials: Open Preview Modal
  const handleOpenPreview = async (material: MaterialItem) => {
    setPreviewMaterial(material);
    let resolvedUrl = material.url;

    if (material.hasLocalFile || material.fileData) {
      if (material.fileData && material.fileData.startsWith('data:')) {
        resolvedUrl = material.fileData;
      } else {
        const localData = await getFileFromIndexedDB(String(material.id));
        if (localData) {
          if (typeof localData === 'string' && localData.startsWith('data:')) {
            resolvedUrl = localData;
          } else if (localData instanceof Blob) {
            resolvedUrl = URL.createObjectURL(localData);
          }
        }
      }
    } else if (material.url.includes('drive.google.com/file/d/')) {
      const match = material.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        resolvedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }
    setPreviewUrl(resolvedUrl);
    setIsPreviewModalOpen(true);
  };

  // Materials: Select as Active Source for Gemini Chat
  const handleSelectMaterialForChat = (mat: MaterialItem) => {
    setChatSelectedMaterial(mat);
    setIsPreviewModalOpen(false);
    setIsChatCollapsed(false);
    showToast(`Fonte collegata: "${mat.name}". Chiedi a Gemini!`);
  };

  // Materials: Delete Resource
  const handleDeleteMaterial = async (materialId: string | number) => {
    const confirmed = await openCustomDialog({
      title: '🗑️ Rimuovi Risorsa',
      description: 'Sei sicuro di voler rimuovere questo file dalla libreria della materia?',
      confirmText: 'Elimina',
      danger: true
    });

    if (confirmed) {
      await deleteFileFromIndexedDB(String(materialId));
      if (chatSelectedMaterial && String(chatSelectedMaterial.id) === String(materialId)) {
        setChatSelectedMaterial(null);
      }
      const currentSubMaterials = materials[activeSubject] || [];
      const filtered = currentSubMaterials.filter(m => m.id !== materialId);
      const updated = { ...materials, [activeSubject]: filtered };
      setMaterials(updated);
      WorkspaceService.saveLocalMaterials(updated);

      if (currentUser) {
        await WorkspaceService.deleteMaterialFromCloud(currentUser.uid, materialId);
      }
      showToast('Risorsa rimossa.');
    }
  };

  // Helper to determine icon, color, and badge for materials
  const getFileMeta = (name: string, url: string, fileType?: string) => {
    const n = name.toLowerCase();
    const u = url.toLowerCase();
    const ft = (fileType || '').toLowerCase();

    if (ft === 'pdf' || n.includes('.pdf') || u.includes('.pdf') || u.includes('export=download') || n.includes('dispensa') || n.includes('slide')) {
      return { icon: '📄', color: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.4)', type: 'Documento PDF' };
    }
    if (ft === 'image' || n.includes('foto') || n.includes('img') || u.includes('.png') || u.includes('.jpg') || u.includes('.jpeg')) {
      return { icon: '🖼️', color: 'rgba(56, 189, 248, 0.2)', border: 'rgba(56, 189, 248, 0.4)', type: 'Immagine' };
    }
    if (u.includes('youtube.com') || u.includes('youtu.be') || n.includes('video') || n.includes('rec')) {
      return { icon: '🎥', color: 'rgba(244, 63, 94, 0.2)', border: 'rgba(244, 63, 94, 0.4)', type: 'Video / Media' };
    }
    if (ft === 'doc' || n.includes('doc') || n.includes('txt') || u.includes('docs.google.com')) {
      return { icon: '📝', color: 'rgba(34, 197, 94, 0.2)', border: 'rgba(34, 197, 94, 0.4)', type: 'Testo' };
    }
    if (u.includes('drive.google.com')) {
      return { icon: '📁', color: 'rgba(234, 179, 8, 0.2)', border: 'rgba(234, 179, 8, 0.4)', type: 'Link Drive' };
    }
    return { icon: '🔗', color: 'rgba(168, 85, 247, 0.2)', border: 'rgba(168, 85, 247, 0.4)', type: 'Risorsa Web' };
  };

  // Gemini AI Chat Execution with Keys Auto-Rotation & Document Grounding
  const handleSendAIChat = async (customPrompt: string | null = null, isAnalysis: boolean = false) => {
    const userText = customPrompt || chatInput.trim();
    if (!userText && !attachedFile && !chatSelectedMaterial) return;

    if (apiKeys.length === 0) {
      showToast('Nessuna API Key salvata! Aggiungi almeno una chiave per Gemini.', 'error');
      handleOpenKeysModal();
      return;
    }

    // Build ordered list of keys starting with the selected/preferred key
    const orderedKeys: string[] = [];
    if (apiKeys[selectedKeyIndex]) orderedKeys.push(apiKeys[selectedKeyIndex]);
    apiKeys.forEach((k, idx) => {
      if (idx !== selectedKeyIndex && k.trim()) orderedKeys.push(k.trim());
    });

    const currentSubChats = chats[activeSubject] || [];
    const userParts: any[] = [];
    if (userText) userParts.push({ text: userText });

    // 1. Transient manual attached image/file
    if (attachedFile) {
      userParts.push({
        inlineData: {
          mimeType: attachedFile.mimeType,
          data: attachedFile.data
        }
      });
    }

    // 2. Active Course Material / PDF attached to Chat
    if (chatSelectedMaterial) {
      let base64Data = '';
      if (chatSelectedMaterial.fileData && chatSelectedMaterial.fileData.includes(',')) {
        base64Data = chatSelectedMaterial.fileData.split(',')[1];
      } else {
        const localData = await getFileFromIndexedDB(String(chatSelectedMaterial.id));
        if (typeof localData === 'string' && localData.includes(',')) {
          base64Data = localData.split(',')[1];
        }
      }

      const isPdfOrImg =
        chatSelectedMaterial.fileType === 'pdf' ||
        chatSelectedMaterial.fileType === 'image' ||
        chatSelectedMaterial.mimeType?.includes('pdf') ||
        chatSelectedMaterial.mimeType?.includes('image');

      if (base64Data && isPdfOrImg) {
        userParts.push({
          inlineData: {
            mimeType: chatSelectedMaterial.mimeType || 'application/pdf',
            data: base64Data
          }
        });
      }
    }

    const newUserMsg: ChatMessage = {
      role: 'user',
      parts: userParts,
      rawText: isAnalysis ? `🔍 ${userText}` : chatSelectedMaterial ? `[📎 ${chatSelectedMaterial.name}] ${userText}` : userText,
      timestamp: Date.now()
    };

    const nextChats = [...currentSubChats, newUserMsg];
    setChats(prev => ({ ...prev, [activeSubject]: nextChats }));
    if (!customPrompt) setChatInput('');
    setIsAILoading(true);

    const noteText = notesAreaRef.current?.innerText.trim() || '';
    let systemContext = noteText
      ? `Sei un assistente ITS per "${activeSubject}". Appunti della lezione:\n\n${noteText}`
      : `Sei un assistente ITS per "${activeSubject}".`;

    if (chatSelectedMaterial) {
      systemContext += `\n\n[FONTE COLLEGATA DALL'UTENTE]: "${chatSelectedMaterial.name}" (${chatSelectedMaterial.category}). Rispondi in modo esaustivo facendo riferimento e spiegando accuratamente i contenuti di questo materiale.`;
    }

    let success = false;
    let lastErrorMessage = '';

    for (let i = 0; i < orderedKeys.length; i++) {
      const currentKey = orderedKeys[i];
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${currentKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemContext }] },
              contents: nextChats.map(m => ({
                role: m.role === 'ai' ? 'model' : m.role,
                parts: m.parts
              }))
            })
          }
        );

        const data = await response.json();

        if (data.error) {
          const errMsg = data.error.message || '';
          if (errMsg.includes('high demand') || data.error.status === 'UNAVAILABLE' || data.error.code === 503) {
            lastErrorMessage = 'Traffico elevato sui server Gemini. Riprova tra poco.';
            break;
          }
          if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED' || errMsg.includes('quota')) {
            console.warn(`Chiave #${i + 1} quota esaurita. Tento chiave successiva...`);
            lastErrorMessage = 'Quota esaurita per la chiave attiva. Testo le chiavi di riserva...';
            continue;
          } else {
            throw new Error(errMsg || 'Errore durante la richiesta AI.');
          }
        }

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          const aiText = data.candidates[0].content.parts[0].text;
          setLastAIResponse(aiText);

          const newAIMsg: ChatMessage = {
            role: 'model',
            parts: [{ text: aiText }],
            rawText: aiText,
            timestamp: Date.now()
          };

          const finalChatList = [...nextChats, newAIMsg];
          setChats(prev => {
            const updated = { ...prev, [activeSubject]: finalChatList };
            WorkspaceService.saveLocalChats(updated);
            return updated;
          });

          if (currentUser) {
            await WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, finalChatList);
          }

          setAttachedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          success = true;
          break;
        }
      } catch (err: any) {
        lastErrorMessage = err.message || 'Errore di connessione.';
      }
    }

    setIsAILoading(false);

    if (!success) {
      const errorAIMsg: ChatMessage = {
        role: 'model',
        parts: [{ text: `⚠️ **Attenzione:** ${lastErrorMessage || 'Impossibile completare la richiesta. Verificare le API keys.'}` }],
        rawText: lastErrorMessage,
        timestamp: Date.now()
      };
      setChats(prev => ({
        ...prev,
        [activeSubject]: [...nextChats, errorAIMsg]
      }));
    }
  };

  // Analyze Notes with Gemini
  const handleAnalyzeNotes = () => {
    const currentNotes = notesAreaRef.current?.innerText.trim() || '';
    const instruction = chatInput.trim();
    let prompt = '';
    if (attachedFile) {
      prompt = instruction
        ? `Analizza l'allegato e rispondi: "${instruction}"`
        : `Estrai le informazioni chiave dall'allegato e sintetizzale.`;
    } else if (currentNotes) {
      prompt = instruction
        ? `Applica questa istruzione agli appunti: "${instruction}"`
        : `Correggi, organizza e riassumi i punti salienti degli appunti attuali.`;
    } else {
      showToast('Scrivi degli appunti o allega un file prima di avviare l\'analisi!', 'error');
      return;
    }
    handleSendAIChat(prompt, true);
  };

  // Append Last AI Response to Active Note
  const handleAppendLastResponse = () => {
    if (!lastAIResponse) {
      showToast('Nessuna risposta AI recente da aggiungere.', 'error');
      return;
    }
    setActiveTab('notes');
    if (notesAreaRef.current) {
      const parsedHtml = marked.parse(lastAIResponse) as string;
      notesAreaRef.current.innerHTML += (notesAreaRef.current.innerHTML ? '<br><br>' : '') + parsedHtml;
      handleEditorInput();
      showToast('Risposta AI aggiunta agli appunti!');
    }
  };

  // Clear Chat History for Subject
  const handleClearChatHistory = async () => {
    const confirmed = await openCustomDialog({
      title: '🧹 Pulisci Conversazione',
      description: `Vuoi azzerare la cronologia chat per <b>${activeSubject}</b>?`,
      confirmText: 'Pulisci',
      danger: true
    });
    if (confirmed) {
      setChats(prev => {
        const updated = { ...prev, [activeSubject]: [] };
        WorkspaceService.saveLocalChats(updated);
        return updated;
      });
      if (currentUser) {
        await WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, []);
      }
      showToast('Cronologia chat azzerata.');
    }
  };

  // File Upload for AI
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = (ev.target?.result as string).split(',')[1];
      setAttachedFile({
        name: file.name,
        mimeType: file.type,
        data: base64
      });
      showToast(`File "${file.name}" allegato con successo.`);
    };
    reader.readAsDataURL(file);
  };

  // API Keys Modal handlers
  const handleOpenKeysModal = () => {
    const keys = apiKeys.length > 0 ? [...apiKeys] : [''];
    setModalKeysDraft(keys);
    setModalSelectedKeyDraft(selectedKeyIndex);
    setIsKeysModalOpen(true);
  };

  const handleSaveKeys = async () => {
    const validKeys = modalKeysDraft.map(k => k.trim()).filter(k => k.length > 0);
    const newSelectedIdx = Math.min(modalSelectedKeyDraft, Math.max(0, validKeys.length - 1));

    setApiKeys(validKeys);
    setSelectedKeyIndex(newSelectedIdx);
    WorkspaceService.saveLocalApiKeys(validKeys, newSelectedIdx);

    if (currentUser) {
      await WorkspaceService.saveApiKeysToCloud(currentUser.uid, validKeys, newSelectedIdx);
    }

    setIsKeysModalOpen(false);
    showToast('Chiavi API salvate e sincronizzate.');
  };

  // Context Menu for Notes Area
  const handleNotesContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    let range: Range | null = null;
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0).cloneRange();
    }

    let x = e.pageX;
    let y = e.pageY;
    const menuWidth = 240;
    const menuHeight = 220;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    setContextMenu({
      visible: true,
      x,
      y,
      selectedText: text,
      savedRange: range
    });
    e.preventDefault();
  };

  const handleContextMenuAction = (action: string) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    const { selectedText, savedRange } = contextMenu;

    if (action === 'incolla_ai') {
      if (lastAIResponse && notesAreaRef.current) {
        notesAreaRef.current.focus();
        if (savedRange) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        }
        document.execCommand('insertHTML', false, marked.parse(lastAIResponse) as string);
        handleEditorInput();
        showToast('Risposta AI incollata!');
      }
      return;
    }

    if (!selectedText) return;

    let prompt = '';
    switch (action) {
      case 'correggi':
        prompt = `Correggi la grammatica e la sintassi del seguente testo mantenendo il significato:\n"${selectedText}"`;
        break;
      case 'migliora':
        prompt = `Migliora la scrittura del seguente testo, rendendolo più chiaro, scorrevole e professionale:\n"${selectedText}"`;
        break;
      case 'riassumi':
        prompt = `Riassumi in modo conciso e a punti salienti questo testo:\n"${selectedText}"`;
        break;
      case 'spiega':
        prompt = `Spiegami in modo dettagliato ma chiaro e semplice questo concetto:\n"${selectedText}"`;
        break;
      case 'traduci':
        prompt = `Agisci da dizionario bilingue conciso. Analizza questa parola o frase:\n"${selectedText}"\nSe è in inglese traduci in italiano, se in italiano traduci in inglese. Includi traduzione, sinonimi e un breve esempio d'uso.`;
        break;
    }

    if (isChatCollapsed) {
      setIsChatCollapsed(false);
    }
    handleSendAIChat(prompt, true);
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev));
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Copy AI Message
  const handleCopyAiMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Testo copiato negli appunti!');
  };

  // Export full Workspace JSON backup
  const handleExportBackup = () => {
    const backupData = {
      exportDate: new Date().toISOString(),
      user: currentUser ? { uid: currentUser.uid, email: currentUser.email } : null,
      subjects,
      pages,
      materials,
      chats,
      preferences: { bgIndex, isImmersion, isSidebarCollapsed, isChatCollapsed, selectedModel }
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_its_backup_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON scaricato con successo.');
  };

  // Active Subject Pages
  const currentSubPages = pages[activeSubject] || [];
  const currentSubMaterials = materials[activeSubject] || [];
  const currentSubChats = chats[activeSubject] || [];

  // Group materials by category
  const groupedMaterials: Record<string, MaterialItem[]> = {};
  currentSubMaterials.forEach(m => {
    const cat = m.category || 'Lezioni';
    if (!groupedMaterials[cat]) groupedMaterials[cat] = [];
    groupedMaterials[cat].push(m);
  });

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Top Floating Controls */}
      <div className="top-controls">
        {/* Auth / Cloud Sync Status Button */}
        {authLoading ? (
          <span className="top-btn" style={{ opacity: 0.6 }}>Caricamento...</span>
        ) : currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isAdmin && (
              <button
                className="top-btn"
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: '#fde047'
                }}
                onClick={() => setIsAdminModalOpen(true)}
                title="Gestione Accessi e Approvazione Utenti"
              >
                👑 Utenti
                {accessRequests.filter(r => r.status === 'pending').length > 0 && (
                  <span
                    style={{
                      background: '#f43f5e',
                      color: '#fff',
                      borderRadius: '999px',
                      padding: '1px 6px',
                      fontSize: '0.68rem',
                      fontWeight: 700
                    }}
                  >
                    {accessRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
            <button
              className="top-btn top-btn-auth"
              onClick={() => setIsSyncModalOpen(true)}
              title="Gestisci stato di sincronizzazione Cloud e backup"
            >
              <div className="sync-dot"></div>
              <span>Cloud Sync</span>
              {currentUser.photoURL && (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  style={{ width: '16px', height: '16px', borderRadius: '50%' }}
                />
              )}
            </button>
            <button
              className="top-btn"
              onClick={handleLogout}
              title="Disconnetti account Google"
              style={{ padding: '6px 10px' }}
            >
              Esci
            </button>
          </div>
        ) : (
          <button
            className="top-btn top-btn-auth"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            style={{ opacity: isLoggingIn ? 0.7 : 1, cursor: isLoggingIn ? 'wait' : 'pointer' }}
            title="Accedi con Google per sincronizzare i tuoi dati su Cloud Firestore"
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Accedi con Google</span>
          </button>
        )}

        <button className="top-btn" id="immersion-btn" onClick={handleToggleImmersion}>
          {isImmersion ? 'Esci da Focus' : 'Focus Mode'}
        </button>
        <button className="top-btn" onClick={handleChangeBackground}>
          Sfondo
        </button>
      </div>

      {/* Main 3-Column Dashboard Container */}
      <div
        className={`dashboard-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${
          isChatCollapsed ? 'chat-collapsed' : ''
        }`}
        id="main-container"
      >
        {/* Left Column: Tools & Quick Launch */}
        <div className="panel tools-column">
          <div className="sidebar-top-row">
            <div className="datetime-header">
              <div id="clock">{currentTime}</div>
              <div id="date">{currentDate}</div>
            </div>
            <button
              className="sidebar-toggle-btn"
              onClick={handleToggleSidebar}
              title="Riduci / Espandi Pannello"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          {/* Weather Widget */}
          <div className="weather-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span style={{ fontWeight: 600, color: '#f4f4f6' }}>🌤️ Seregno</span>
              <span style={{ color: '#818cf8', fontWeight: 500 }}>ITS Meteo</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="search-container">
            <form action="https://www.google.com/search" method="GET" target="_blank">
              <input type="text" name="q" placeholder="Ricerca globale..." autoComplete="off" />
            </form>
          </div>

          {/* App Shortcuts Grid */}
          <div className="apps-grid">
            <a href="https://notebooklm.google.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M8 7h8" /><path d="M8 11h6" />
              </svg>
              <span className="app-name">NotebookLM</span>
            </a>
            <a href="https://gemini.google.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
              </svg>
              <span className="app-name">Gemini</span>
            </a>
            <a href="https://claude.ai" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
              </svg>
              <span className="app-name">Claude</span>
            </a>
            <a href="https://chat.openai.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="app-name">ChatGPT</span>
            </a>
            <a href="https://github.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <span className="app-name">GitHub</span>
            </a>
            <a href="https://itsar.registrodiclasse.it/geopcfp2/" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
              </svg>
              <span className="app-name">GEOP ITS</span>
            </a>
            <a href="https://drive.google.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 12H12l-5 9h10l5-9z" /><path d="M6 12L2 5h10l4 7-10 9z" />
              </svg>
              <span className="app-name">Drive</span>
            </a>
            <a href="https://mail.google.com" className="app-card" target="_blank" rel="noreferrer">
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
              <span className="app-name">Gmail</span>
            </a>
          </div>
        </div>

        {/* Center Column: Workspace Notes & Materials */}
        <div className={`panel ${isNotesMaximized ? 'notes-maximized' : ''}`} id="notes-panel">
          <div className="notes-header">
            <div className="notes-header-left">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <select
                id="subject-select"
                value={activeSubject}
                onChange={e => handleSelectSubject(e.target.value)}
              >
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="header-btn"
                onClick={() => handleDeleteSubject(activeSubject)}
                title={subjects.length > 1 ? `Elimina la materia "${activeSubject}"` : "Non puoi eliminare l'unica materia presente (creane prima un'altra con '+ Nuova')"}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#f87171',
                  borderColor: 'rgba(239, 68, 68, 0.45)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginLeft: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  opacity: subjects.length > 1 ? 1 : 0.65
                }}
              >
                🗑️ Elimina
              </button>
            </div>
            <div className="notes-header-right">
              <button className="header-btn" onClick={handleAddNewSubject} title="Crea una nuova materia">
                + Nuova
              </button>
              <button className="header-btn" id="fullscreen-btn" onClick={handleToggleFullscreenNotes}>
                {isNotesMaximized ? 'Riduci' : 'Massimizza'}
              </button>
            </div>
          </div>

          {/* Drive Bar */}
          <div className="drive-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 12H12l-5 9h10l5-9z" /><path d="M6 12L2 5h10l4 7-10 9z" />
            </svg>
            <input
              type="url"
              placeholder="Incolla qui il link della cartella Drive del corso..."
              value={driveLink}
              onChange={handleDriveLinkChange}
            />
            <button className="drive-btn" onClick={handleOpenDrive}>
              🔗 Apri Drive
            </button>
          </div>

          {/* Segmented Control Tabs */}
          <div className="tabs-container">
            <button
              className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              📝 Appunti
            </button>
            <button
              className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              📚 Materiali (PDF/Link)
            </button>
          </div>

          {/* Content Area */}
          <div className="content-area">
            {activeTab === 'notes' ? (
              <div id="notes-area-container">
                {/* VS Code Style Tabs Bar */}
                <div className="vscode-tabs-bar">
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {currentSubPages.map(page => (
                      <div
                        key={page.id}
                        className={`vscode-tab ${page.id === activePageId ? 'active' : ''}`}
                        onClick={() => setActivePageId(page.id)}
                        onContextMenu={e => {
                          e.preventDefault();
                          handleRenamePage(page.id);
                        }}
                        title="Clicca per aprire, clic destro per rinominare"
                      >
                        <span>{page.name}</span>
                        <span
                          className="close-tab"
                          onClick={e => handleDeletePage(page.id, e)}
                          title="Chiudi"
                        >
                          ✕
                        </span>
                      </div>
                    ))}
                  </div>
                  <button className="add-tab-btn" onClick={handleAddNewPage} title="Nuova Pagina">
                    +
                  </button>
                </div>

                {/* Editor Toolbar */}
                <div className="editor-toolbar">
                  <button onClick={() => handleFormatText('bold')} title="Grassetto">
                    <b>B</b>
                  </button>
                  <button onClick={() => handleFormatText('italic')} title="Corsivo">
                    <i>I</i>
                  </button>
                  <button onClick={() => handleFormatText('underline')} title="Sottolineato">
                    <u>U</u>
                  </button>
                  <button onClick={() => handleFormatText('strikeThrough')} title="Barrato">
                    <s>S</s>
                  </button>
                  <span className="divider"></span>
                  <button onClick={() => handleFormatText('insertUnorderedList')} title="Elenco puntato">
                    •
                  </button>
                  <button onClick={() => handleFormatText('insertOrderedList')} title="Elenco numerato">
                    1.
                  </button>
                  <span className="divider"></span>
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        handleFormatText('formatBlock', e.target.value);
                        e.target.selectedIndex = 0;
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Stile Testo
                    </option>
                    <option value="H1">Titolo 1 (H1)</option>
                    <option value="H2">Titolo 2 (H2)</option>
                    <option value="H3">Titolo 3 (H3)</option>
                    <option value="P">Paragrafo (Normale)</option>
                  </select>
                  <button
                    onClick={() => handleFormatText('removeFormat')}
                    title="Rimuovi formattazione"
                    style={{ marginLeft: 'auto' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Contenteditable Notes Area */}
                <div
                  id="notes-area"
                  ref={notesAreaRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Inizia a digitare o formatta usando i tasti sopra..."
                  onInput={handleEditorInput}
                  onContextMenu={handleNotesContextMenu}
                />
              </div>
            ) : (
              <div id="materials-area">
                <div className="materials-header-bar">
                  <span className="materials-header-title">Libreria File & PDF</span>
                  <button className="add-material-btn" onClick={handleOpenAddMaterialModal}>
                    + Aggiungi File / Link
                  </button>
                </div>

                {Object.keys(groupedMaterials).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0' }}>
                    Nessuna risorsa salvata per questa materia. Clicca su "+ Aggiungi File / Link" per caricare dispense, PDF o link.
                  </div>
                ) : (
                  Object.entries(groupedMaterials).map(([cat, items]) => (
                    <div key={cat} className="material-category">
                      <div className="material-category-title">{cat}</div>
                      <div className="materials-grid">
                        {items.map(f => {
                          const meta = getFileMeta(f.name, f.url, f.fileType);
                          return (
                            <div key={f.id} className="material-card">
                              <div className="material-info">
                                <div
                                  className="material-icon-box"
                                  style={{ background: meta.color, border: `1px solid ${meta.border}` }}
                                >
                                  {meta.icon}
                                </div>
                                <div className="material-text">
                                  <div className="material-name" title={f.name}>
                                    {f.name}
                                  </div>
                                  <div className="material-sub">
                                    {meta.type} {f.fileSize ? `• ${(f.fileSize / 1024).toFixed(0)} KB` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="material-actions">
                                <button
                                  className="material-preview-btn"
                                  onClick={() => handleOpenPreview(f)}
                                  title="Visualizza anteprima documento o PDF"
                                >
                                  👁️ Anteprima
                                </button>
                                <button
                                  className="material-ai-btn"
                                  onClick={() => handleSelectMaterialForChat(f)}
                                  title="Chiedi spiegazioni a Gemini su questo materiale"
                                >
                                  🧠 AI
                                </button>
                                <a
                                  href={f.url && f.url.startsWith('http') ? f.url : '#'}
                                  onClick={e => {
                                    if (!f.url || !f.url.startsWith('http')) {
                                      e.preventDefault();
                                      handleOpenPreview(f);
                                    }
                                  }}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="material-dl-btn"
                                  title="Apri o Scarica file"
                                >
                                  Apri
                                </a>
                                <button
                                  className="material-del-btn"
                                  onClick={() => handleDeleteMaterial(f.id)}
                                  title="Rimuovi"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Copilot Panel */}
        <div className="panel chat-column" id="chat-column">
          <div className="ai-chat-panel">
            <div className="chat-header-bar">
              <button
                className="expand-btn"
                onClick={handleToggleChat}
                style={{ fontSize: '1rem', padding: '2px 6px' }}
                title="Riduci / Espandi Chat"
              >
                {isChatCollapsed ? '◀' : '▶'}
              </button>
              <span className="chat-title">Gemini Copilot</span>
              <div className="chat-controls-hide">
                <button className="expand-btn" onClick={handleClearChatHistory} title="Pulisci cronologia chat">
                  🧹 Pulisci
                </button>
              </div>
            </div>

            <div className="chat-vertical-title">GEMINI AI</div>

            {/* Chat Messages */}
            <div className="chat-messages" ref={chatMessagesRef}>
              {currentSubChats.length === 0 ? (
                <div className="chat-msg ai">
                  Chiedi qualcosa, dai istruzioni o premi <b>🔍 Analizza Note</b> per lavorare sugli appunti di{' '}
                  <b>{activeSubject}</b>!
                </div>
              ) : (
                currentSubChats.map((msg, index) => {
                  const text = msg.parts?.[0]?.text || msg.rawText || '';
                  const hasFile = msg.parts?.some(p => p.inlineData);

                  if (msg.role === 'model' || msg.role === 'ai') {
                    return (
                      <div key={index} className="chat-msg ai">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(text) as string
                          }}
                        />
                        <button
                          className="msg-action-btn"
                          title="Copia risposta"
                          onClick={() => handleCopyAiMessage(text)}
                        >
                          📋
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <div key={index} className="chat-msg user">
                        <div>{text || 'Analizza allegato.'}</div>
                        {hasFile && <small style={{ opacity: 0.8 }}>📎 File Allegato</small>}
                        <button
                          className="msg-action-btn"
                          title="Reinvia messaggio"
                          onClick={() => {
                            setChatInput(text);
                            handleSendAIChat(text);
                          }}
                        >
                          🔄
                        </button>
                      </div>
                    );
                  }
                })
              )}
              {isAILoading && (
                <div className="chat-msg ai" style={{ opacity: 0.7 }}>
                  <span>Gemini sta elaborando... ✦</span>
                </div>
              )}
            </div>

            {/* File Upload Preview Bar */}
            <div className="file-upload-preview-bar">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button className="chat-btn" onClick={() => fileInputRef.current?.click()}>
                📎 Allega File
              </button>
              {attachedFile && (
                <div id="attached-file-badge">
                  <span>{attachedFile.name}</span>
                  <button
                    onClick={() => {
                      setAttachedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Active Document Source & Selector */}
            {chatSelectedMaterial ? (
              <div className="chat-source-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span>📎</span>
                  <span className="chat-source-name" title={chatSelectedMaterial.name}>
                    {chatSelectedMaterial.name}
                  </span>
                </div>
                <button
                  className="chat-source-clear"
                  onClick={() => setChatSelectedMaterial(null)}
                  title="Scollega documento"
                >
                  ✕
                </button>
              </div>
            ) : (
              (materials[activeSubject] || []).length > 0 && (
                <div className="chat-source-select-bar">
                  <select
                    value=""
                    onChange={e => {
                      const mat = (materials[activeSubject] || []).find(m => String(m.id) === e.target.value);
                      if (mat) {
                        handleSelectMaterialForChat(mat);
                      }
                    }}
                    className="chat-source-dropdown"
                  >
                    <option value="" disabled>
                      📎 Collega un file/PDF alla chat...
                    </option>
                    {(materials[activeSubject] || []).map(m => (
                      <option key={m.id} value={String(m.id)}>
                        {m.fileType === 'pdf' ? '📄' : '🔗'} {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}

            {/* Quick Prompts when document is active */}
            {chatSelectedMaterial && (
              <div className="chat-quick-chips">
                <button
                  className="chat-chip"
                  onClick={() =>
                    handleSendAIChat(`Riassumi in 5 punti chiave il documento "${chatSelectedMaterial.name}"`)
                  }
                >
                  📝 Riassumi
                </button>
                <button
                  className="chat-chip"
                  onClick={() =>
                    handleSendAIChat(`Fammi 3 domande d'esame basate sul documento "${chatSelectedMaterial.name}"`)
                  }
                >
                  ❓ Interrogami
                </button>
                <button
                  className="chat-chip"
                  onClick={() =>
                    handleSendAIChat(`Spiegami i concetti più complessi di "${chatSelectedMaterial.name}"`)
                  }
                >
                  💡 Spiega concetti
                </button>
              </div>
            )}

            {/* API Keys & Model Selector */}
            <div className="chat-input-row">
              <button
                className="chat-btn"
                onClick={handleOpenKeysModal}
                style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
              >
                🔑 Keys {apiKeys.length > 0 ? `(${apiKeys.length})` : ''}
              </button>

              <select
                value={selectedModel}
                onChange={e => {
                  setSelectedModel(e.target.value);
                  WorkspaceService.saveLocalPreferences({ selectedModel: e.target.value });
                  if (currentUser) {
                    WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, {
                      selectedModel: e.target.value
                    });
                  }
                }}
                style={{ flex: 1, minWidth: '90px' }}
              >
                <option value="gemini-3.8-flash">3.8 Flash</option>
                <option value="gemini-3.8-pro">3.8 Pro</option>
                <option value="gemini-3.6-flash">3.6 Flash</option>
              </select>
            </div>

            {/* Input Row */}
            <div className="chat-input-row" style={{ marginTop: '8px' }}>
              <input
                type="text"
                id="user-chat-input"
                placeholder="Chiedi a Gemini..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendAIChat();
                  }
                }}
              />
              <button className="chat-btn accent" onClick={() => handleSendAIChat()}>
                Invia
              </button>
            </div>

            {/* Bottom Action Buttons */}
            <div className="chat-input-row" style={{ marginTop: '8px', justifyContent: 'space-between' }}>
              <button className="chat-btn" onClick={handleAnalyzeNotes}>
                🔍 Analizza Note
              </button>
              <button className="chat-btn" onClick={handleAppendLastResponse}>
                ➕ Aggiungi
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALE GESTIONE API KEYS */}
      {isKeysModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Gestione API Keys Gemini</span>
              <button className="modal-close" onClick={() => setIsKeysModalOpen(false)}>
                ✕
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Aggiungi quante chiavi desideri. Seleziona col pallino quella principale. Se esaurisce la quota (429),
              il sistema passerà automaticamente a quella successiva.
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '250px',
                overflowY: 'auto',
                paddingRight: '4px'
              }}
            >
              {modalKeysDraft.map((k, idx) => (
                <div key={idx} className="key-row">
                  <input
                    type="radio"
                    name="modal-active-key"
                    checked={modalSelectedKeyDraft === idx}
                    onChange={() => setModalSelectedKeyDraft(idx)}
                    title="Usa questa come chiave preferita"
                  />
                  <input
                    type="password"
                    value={k}
                    placeholder="Incolla API Key (AIzaSy...)"
                    onChange={e => {
                      const updated = [...modalKeysDraft];
                      updated[idx] = e.target.value;
                      setModalKeysDraft(updated);
                    }}
                  />
                  <button
                    className="key-del-btn"
                    onClick={() => {
                      const updated = modalKeysDraft.filter((_, i) => i !== idx);
                      setModalKeysDraft(updated);
                      if (modalSelectedKeyDraft === idx) setModalSelectedKeyDraft(0);
                      else if (modalSelectedKeyDraft > idx) setModalSelectedKeyDraft(prev => prev - 1);
                    }}
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="add-key-btn"
              onClick={() => setModalKeysDraft(prev => [...prev, ''])}
            >
              + Aggiungi nuova chiave
            </button>
            <button className="modal-save-btn" onClick={handleSaveKeys}>
              Salva e Sincronizza Chiavi
            </button>
          </div>
        </div>
      )}

      {/* MODALE STATO CLOUD & BACKUP */}
      {isSyncModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Stato Sincronizzazione Cloud</span>
              <button className="modal-close" onClick={() => setIsSyncModalOpen(false)}>
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" style={{ width: '42px', height: '42px', borderRadius: '50%' }} />
              ) : (
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>👤</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{currentUser?.displayName || 'Utente Workspace'}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currentUser?.email}</span>
                <span className="sync-badge-live" style={{ marginTop: '4px', width: 'fit-content' }}>
                  <span className="sync-dot"></span> Cloud Firestore Attivo
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              I tuoi appunti, schede multiple, link Drive, file e chat sono salvati in tempo reale nel tuo database dedicato su Google Cloud Firestore (<code>ai-studio-workspaceits</code>). Solo tu puoi visualizzare e modificare questi dati grazie alle regole di sicurezza isolate per UID.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="dialog-btn"
                style={{ width: '100%', padding: '10px' }}
                onClick={async () => {
                  if (currentUser) {
                    const result = await WorkspaceService.migrateLocalDataToCloud(currentUser.uid);
                    showToast(`Sincronizzati ${result.subjectsCount} corsi e ${result.pagesCount} pagine!`);
                  }
                }}
              >
                📥 Forzatura sincronizzazione dati locali su Cloud
              </button>

              <button
                className="dialog-btn"
                style={{ width: '100%', padding: '10px' }}
                onClick={handleExportBackup}
              >
                💾 Esporta Backup Completo (JSON)
              </button>
            </div>

            <button className="modal-save-btn" onClick={() => setIsSyncModalOpen(false)}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* MODALE AMMINISTRATORE GESTIONE ACCESSI */}
      {isAdminModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <span className="modal-title">👑 Gestione Accessi & Approvazioni</span>
              <button className="modal-close" onClick={() => setIsAdminModalOpen(false)}>
                ✕
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
              <button
                className={`tab-btn ${adminTab === 'requests' ? 'active' : ''}`}
                onClick={() => setAdminTab('requests')}
              >
                Richieste in attesa ({accessRequests.filter(r => r.status === 'pending').length})
              </button>
              <button
                className={`tab-btn ${adminTab === 'approved' ? 'active' : ''}`}
                onClick={() => setAdminTab('approved')}
              >
                Utenti autorizzati ({approvedUsers.filter(u => u.status === 'active').length})
              </button>
            </div>

            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {adminTab === 'requests' ? (
                accessRequests.filter(r => r.status === 'pending').length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                    Nessuna richiesta di accesso in sospeso.
                  </div>
                ) : (
                  accessRequests.filter(r => r.status === 'pending').map((req) => (
                    <div key={req.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {req.photoURL ? (
                          <img src={req.photoURL} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>{req.displayName || req.email}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{req.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="dialog-btn primary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                          onClick={async () => {
                            if (currentUser?.email) {
                              await WorkspaceService.approveUserRequest(req, currentUser.email);
                              showToast(`Utente ${req.email} approvato!`);
                            }
                          }}
                        >
                          Approva
                        </button>
                        <button
                          className="dialog-btn danger"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          onClick={async () => {
                            await WorkspaceService.removeApprovedUser(req.userId);
                            showToast(`Richiesta di ${req.email} rimossa.`);
                          }}
                        >
                          Rifiuta
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : (
                approvedUsers.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                    Nessun utente esterno autorizzato al momento.
                  </div>
                ) : (
                  approvedUsers.map((u) => (
                    <div key={u.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>{u.displayName || u.email}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {u.email} • Stato: <span style={{ color: u.status === 'active' ? '#34d399' : '#f43f5e' }}>{u.status === 'active' ? 'Attivo' : 'Revocato'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {u.status === 'active' ? (
                          <button
                            className="dialog-btn danger"
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            onClick={async () => {
                              await WorkspaceService.revokeApprovedUser(u.userId);
                              showToast(`Accesso revocato per ${u.email}`);
                            }}
                          >
                            Revoca
                          </button>
                        ) : (
                          <button
                            className="dialog-btn primary"
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            onClick={async () => {
                              if (currentUser?.email) {
                                await WorkspaceService.approveUserRequest(u, currentUser.email);
                                showToast(`Accesso ripristinato per ${u.email}`);
                              }
                            }}
                          >
                            Riabilita
                          </button>
                        )}
                        <button
                          className="dialog-btn"
                          style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                          onClick={async () => {
                            await WorkspaceService.removeApprovedUser(u.userId);
                            showToast(`Utente ${u.email} rimosso.`);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>

            <button className="modal-save-btn" onClick={() => setIsAdminModalOpen(false)}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY ACCESSO IN ATTESA DI APPROVAZIONE PER UTENTI NON ADMIN */}
      {currentUser && !isApproved && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '440px', padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Accesso in attesa di autorizzazione</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '12px 0 24px 0' }}>
              Ciao <b>{currentUser.displayName || currentUser.email}</b>!<br/>
              Questo workspace è privato. La tua richiesta è stata inviata all'amministratore (<b>beccalli.fabio4@gmail.com</b>).
              <br/><br/>
              Non appena la tua email verrà autorizzata, potrai accedere immediatamente ai tuoi appunti e sincronizzarli.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="dialog-btn primary"
                onClick={async () => {
                  if (currentUser) {
                    const approved = await WorkspaceService.checkUserApproval(currentUser.uid, currentUser.email);
                    if (approved) {
                      setIsApproved(true);
                      showToast('Accesso approvato! Benvenuto!');
                    } else {
                      showToast('Richiesta ancora in attesa di approvazione.', 'info');
                    }
                  }
                }}
              >
                🔄 Ricontrolla approvazione
              </button>
              <button className="dialog-btn" onClick={handleLogout}>
                Disconnetti account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONTEXT MENU FOR NOTES */}
      {contextMenu.visible && (
        <div
          className="custom-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          {contextMenu.selectedText ? (
            <>
              <div className="context-menu-item" onClick={() => handleContextMenuAction('correggi')}>
                ✨ Correggi grammatica
              </div>
              <div className="context-menu-item" onClick={() => handleContextMenuAction('migliora')}>
                🚀 Migliora scrittura
              </div>
              <div className="context-menu-item" onClick={() => handleContextMenuAction('riassumi')}>
                📝 Riassumi selezione
              </div>
              <div className="context-menu-item" onClick={() => handleContextMenuAction('spiega')}>
                🧠 Spiegami questo
              </div>
              <div className="context-menu-item" onClick={() => handleContextMenuAction('traduci')}>
                🌍 Traduci e Analizza
              </div>
            </>
          ) : (
            <div
              className="context-menu-item"
              onClick={() => handleContextMenuAction('incolla_ai')}
              style={{ opacity: lastAIResponse ? 1 : 0.5, pointerEvents: lastAIResponse ? 'auto' : 'none' }}
            >
              📋 {lastAIResponse ? 'Incolla ultima risposta AI' : 'Nessuna risposta AI da incollare'}
            </div>
          )}
        </div>
      )}

      {/* MODALE ANTEPRIMA FILE & PDF */}
      {isPreviewModalOpen && previewMaterial && (
        <div className="modal-overlay">
          <div className="preview-modal-dialog">
            <div className="preview-modal-header">
              <div className="preview-modal-title">
                <span>{previewMaterial.fileType === 'pdf' ? '📄' : '📎'}</span>
                <span>{previewMaterial.name}</span>
                <span className="material-sub" style={{ marginLeft: '8px' }}>
                  ({previewMaterial.category})
                </span>
              </div>
              <div className="preview-modal-actions">
                <button
                  className="material-ai-btn"
                  onClick={() => handleSelectMaterialForChat(previewMaterial)}
                  title="Collega questo documento alla chat AI per fare domande"
                >
                  🧠 Chiedi a Gemini
                </button>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    download={previewMaterial.name}
                    target="_blank"
                    rel="noreferrer"
                    className="material-dl-btn"
                  >
                    Scarica / Apri ↗
                  </a>
                )}
                <button className="modal-close" onClick={() => setIsPreviewModalOpen(false)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="preview-modal-body">
              {previewUrl ? (
                previewMaterial.fileType === 'image' || previewMaterial.mimeType?.includes('image') ? (
                  <img
                    src={previewUrl}
                    alt={previewMaterial.name}
                    style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <iframe
                    src={previewUrl}
                    className="preview-modal-iframe"
                    title={`Anteprima ${previewMaterial.name}`}
                  />
                )
              ) : (
                <div style={{ color: 'var(--text-secondary)', padding: '30px', textAlign: 'center' }}>
                  Caricamento anteprima non disponibile per questo file o formato.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALE AGGIUNGI MATERIALE (FILE / LINK) */}
      {isAddMaterialModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <span className="modal-title">📎 Aggiungi Materiale / PDF</span>
              <button className="modal-close" onClick={() => setIsAddMaterialModalOpen(false)}>
                ✕
              </button>
            </div>

            {/* Tab switch: File vs Link */}
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px' }}>
              <button
                className={`upload-tab-btn ${addMaterialTab === 'file' ? 'active' : ''}`}
                onClick={() => setAddMaterialTab('file')}
              >
                📄 Carica File / PDF dal PC
              </button>
              <button
                className={`upload-tab-btn ${addMaterialTab === 'link' ? 'active' : ''}`}
                onClick={() => setAddMaterialTab('link')}
              >
                🔗 Link Web / Google Drive
              </button>
            </div>

            {addMaterialTab === 'file' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
                <input
                  type="file"
                  id="material-file-upload-input"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.doc,.docx"
                  onChange={handleMaterialFileChange}
                  style={{ display: 'none' }}
                />
                <label htmlFor="material-file-upload-input" className="drop-zone">
                  {uploadingFile ? (
                    <div>
                      <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>
                        {uploadingFile.fileType === 'pdf' ? '📄' : '🖼️'}
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                        {uploadingFile.originalName}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
                        {(uploadingFile.size / 1024).toFixed(1)} KB • Clicca per sostituire
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: '6px' }}>📥</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem' }}>
                        Clicca qui per selezionare un PDF, dispensa o immagine
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: '4px' }}>
                        Supporta PDF, PNG, JPG, TXT (fino a 25MB)
                      </div>
                    </div>
                  )}
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Titolo risorsa</label>
                  <input
                    type="text"
                    placeholder="Es. Slide Lezione 1"
                    value={customMaterialName}
                    onChange={e => setCustomMaterialName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Categoria</label>
                  <input
                    type="text"
                    placeholder="Es. Lezioni, Esercizi, Dispense"
                    value={customMaterialCategory}
                    onChange={e => setCustomMaterialCategory(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Nome della risorsa</label>
                  <input
                    type="text"
                    placeholder="Es. Cartella Drive Docente, Link YouTube"
                    value={customMaterialName}
                    onChange={e => setCustomMaterialName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Link (URL)</label>
                  <input
                    type="text"
                    placeholder="https://drive.google.com/..."
                    value={customMaterialUrl}
                    onChange={e => setCustomMaterialUrl(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Categoria</label>
                  <input
                    type="text"
                    placeholder="Es. Lezioni, Esercizi, Immagini"
                    value={customMaterialCategory}
                    onChange={e => setCustomMaterialCategory(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button className="dialog-btn" onClick={() => setIsAddMaterialModalOpen(false)}>
                Annulla
              </button>
              <button className="dialog-btn primary" onClick={handleSaveMaterial}>
                Salva Risorsa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSAL CUSTOM DIALOG OVERLAY */}
      {dialogState.isOpen && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <div className="dialog-header">
              <span className="dialog-title">{dialogState.options.title}</span>
              <button className="modal-close" onClick={() => closeCustomDialog(null)}>
                ✕
              </button>
            </div>
            {dialogState.options.description && (
              <div
                className="dialog-desc"
                dangerouslySetInnerHTML={{ __html: dialogState.options.description }}
              />
            )}
            {dialogState.options.fields && dialogState.options.fields.length > 0 && (
              <div className="dialog-fields">
                {dialogState.options.fields.map((f, idx) => {
                  const key = f.id || String(idx);
                  return (
                    <div key={key} className="dialog-field">
                      {f.label && <label>{f.label}</label>}
                      <input
                        type={f.type || 'text'}
                        placeholder={f.placeholder || ''}
                        value={dialogState.fieldValues[key] || ''}
                        autoFocus={idx === 0}
                        onChange={e => {
                          const val = e.target.value;
                          setDialogState(prev => ({
                            ...prev,
                            fieldValues: { ...prev.fieldValues, [key]: val }
                          }));
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitCustomDialog();
                          } else if (e.key === 'Escape') {
                            closeCustomDialog(null);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="dialog-actions">
              {!dialogState.options.hideCancel && (
                <button className="dialog-btn" onClick={() => closeCustomDialog(null)}>
                  {dialogState.options.cancelText || 'Annulla'}
                </button>
              )}
              <button
                className={`dialog-btn ${dialogState.options.danger ? 'danger' : 'primary'}`}
                onClick={submitCustomDialog}
              >
                {dialogState.options.confirmText || 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST CONTAINER */}
      <div className="toast-container" id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type === 'error' ? 'error' : ''}`}>
            <span>{t.type === 'error' ? '⚠️' : '✨'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
