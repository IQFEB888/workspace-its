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
  DialogOptions,
  SharedRoom,
  SharedRoomMember,
  SharedChatMessage
} from './types';
import { WorkspaceService, DEFAULT_SUBJECTS, DEFAULT_PAGES } from './services/workspaceService';
import { saveFileToIndexedDB, getFileFromIndexedDB, deleteFileFromIndexedDB } from './services/fileStorage';
import { WeatherModal } from './components/WeatherModal';
import { SettingsModal, BACKGROUND_THEMES } from './components/SettingsModal';
import { uploadNoteToDrive } from './services/googleDriveService';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  FullWeatherData,
  CityLocation,
  PRESET_CITIES,
  fetchFullWeather
} from './services/weatherService';

// Helper to extract Google Drive file ID from various URL formats
function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
}

// Helper to convert base64 data to blob URL for iframe/object PDF viewing
function base64ToBlobUrl(base64Data: string, mimeType = 'application/pdf'): string {
  try {
    const parts = base64Data.split(';base64,');
    const contentType = parts.length > 1 ? parts[0].replace('data:', '') : mimeType;
    const raw = window.atob(parts.length > 1 ? parts[1] : parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType || 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch (e) {
    return base64Data;
  }
}

const BACKGROUNDS = BACKGROUND_THEMES.map(t => t.cssUrl);

interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'error';
}

export default function App() {
  // PWA Install state (auto-hides when installed or running standalone)
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();

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
  const [fontFamily, setFontFamily] = useState<string>('plus-jakarta');
  const [fontSize, setFontSize] = useState<number>(15);
  const [showWeatherWidget, setShowWeatherWidget] = useState<boolean>(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);

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
  const [mobileTab, setMobileTab] = useState<'notes' | 'materials' | 'chat' | 'tools'>('notes');

  // Collaboration / Shared Rooms State
  const [workspaceMode, setWorkspaceMode] = useState<'personal' | 'shared'>('personal');
  const [userRooms, setUserRooms] = useState<SharedRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('');
  const [activeRoomPages, setActiveRoomPages] = useState<PageItem[]>([]);
  const [activeRoomPageId, setActiveRoomPageId] = useState<string>('');
  const [activeRoomMessages, setActiveRoomMessages] = useState<SharedChatMessage[]>([]);
  const [activeRoomMaterials, setActiveRoomMaterials] = useState<MaterialItem[]>([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [roomModalTab, setRoomModalTab] = useState<'create' | 'join'>('create');
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [roomActionLoading, setRoomActionLoading] = useState<boolean>(false);

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
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [backupPasteText, setBackupPasteText] = useState<string>('');
  const [modalKeysDraft, setModalKeysDraft] = useState<string[]>([]);
  const [modalSelectedKeyDraft, setModalSelectedKeyDraft] = useState<number>(0);

  // Material Preview & PDF Inspection
  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewDriveId, setPreviewDriveId] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);

  // Weather State
  const [selectedWeatherCity, setSelectedWeatherCity] = useState<CityLocation>(PRESET_CITIES[0]);
  const [weatherData, setWeatherData] = useState<FullWeatherData | null>(null);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState<boolean>(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);

  // Google Drive Auto-Sync State
  const [googleDriveApiKey, setGoogleDriveApiKey] = useState<string>(() => {
    return localStorage.getItem('workspace_gdrive_api_key') || '';
  });
  const [googleOAuthAccessToken, setGoogleOAuthAccessToken] = useState<string | null>(null);
  const [isDriveSyncModalOpen, setIsDriveSyncModalOpen] = useState<boolean>(false);

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
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<any[]>([]);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'requests' | 'approved'>('requests');
  const [manualApprovalEmail, setManualApprovalEmail] = useState<string>('');

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
  const backupFileInputRef = useRef<HTMLInputElement>(null);
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

  // Weather Loader Effect
  useEffect(() => {
    let isMounted = true;
    const loadWeather = async () => {
      setIsWeatherLoading(true);
      try {
        const data = await fetchFullWeather(selectedWeatherCity);
        if (isMounted && data) {
          setWeatherData(data);
        }
      } catch (err) {
        console.warn('Weather fetch error:', err);
      } finally {
        if (isMounted) setIsWeatherLoading(false);
      }
    };
    loadWeather();
    const interval = setInterval(loadWeather, 15 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedWeatherCity]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalizzazione non supportata dal tuo browser.', 'error');
      return;
    }
    setIsWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Number(pos.coords.latitude.toFixed(2));
        const lon = Number(pos.coords.longitude.toFixed(2));
        const customCity: CityLocation = {
          name: 'Mia Posizione',
          lat,
          lon,
          region: 'GPS'
        };
        setSelectedWeatherCity(customCity);
        showToast('📍 Posizione GPS rilevata!');
      },
      () => {
        setIsWeatherLoading(false);
        showToast('Impossibile ottenere la posizione GPS. Verifica i permessi del browser.', 'error');
      }
    );
  };

  // Initialize from LocalStorage first (Fast offline-first render)
  useEffect(() => {
    const localPref = WorkspaceService.getLocalPreferences();
    setBgIndex(localPref.bgIndex);
    setIsImmersion(localPref.isImmersion);
    setIsSidebarCollapsed(localPref.isSidebarCollapsed);
    setIsChatCollapsed(localPref.isChatCollapsed);
    setSelectedModel(localPref.selectedModel);
    if (localPref.fontFamily) setFontFamily(localPref.fontFamily);
    if (localPref.fontSize) setFontSize(localPref.fontSize);
    if (typeof localPref.showWeatherWidget === 'boolean') {
      setShowWeatherWidget(localPref.showWeatherWidget);
    }

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

      if (!user) {
        setCurrentUser(null);
        setIsAdmin(false);
        setIsApproved(false);
        setCloudSyncActive(false);
        setAuthLoading(false);
        return;
      }

      const isUserSuperAdmin = WorkspaceService.isSuperAdmin(user.email, user.displayName);
      let userIsApproved = isUserSuperAdmin;
      if (!isUserSuperAdmin) {
        userIsApproved = await WorkspaceService.checkUserApproval(user.uid, user.email, user.displayName);
      }

      // Batch state updates together AFTER approval check resolves to prevent unauthorized effect runs
      setIsAdmin(isUserSuperAdmin);
      setIsApproved(userIsApproved);
      setCurrentUser(user);
      setAuthLoading(false);

      const attachWaitingModeListeners = (targetUser: User) => {
        setIsApproved(false);
        setCloudSyncActive(false);
        WorkspaceService.submitAccessRequest(targetUser);

        let unlocked = false;
        const handleUnlock = () => {
          if (unlocked) return;
          unlocked = true;
          if (activeListenersCleanupRef.current) {
            activeListenersCleanupRef.current();
            activeListenersCleanupRef.current = null;
          }
          setIsApproved(true);
          setCloudSyncActive(true);
          showToast('Accesso autorizzato dall\'amministratore! Benvenuto.');
          startCloudSyncForUser(targetUser, false);
        };

        const unsubApproval = WorkspaceService.subscribeToUserApprovalStatus(targetUser.uid, targetUser.email, approved => {
          if (approved) handleUnlock();
        });

        const autoCheckInterval = setInterval(async () => {
          const approved = await WorkspaceService.checkUserApproval(targetUser.uid, targetUser.email, targetUser.displayName);
          if (approved) handleUnlock();
        }, 2500);

        activeListenersCleanupRef.current = () => {
          unsubApproval();
          clearInterval(autoCheckInterval);
        };
      };

      const startCloudSyncForUser = async (targetUser: User, isAdminUser: boolean) => {
        let unsubAdminReq: (() => void) | null = null;
        let unsubAdminAppr: (() => void) | null = null;
        let unsubRevokeWatch: (() => void) | null = null;

        if (isAdminUser) {
          WorkspaceService.cleanupSuperAdminRecords(targetUser);
          unsubAdminReq = WorkspaceService.subscribeToAccessRequests(setAccessRequests);
          unsubAdminAppr = WorkspaceService.subscribeToApprovedUsers(setApprovedUsers);
        } else {
          // Watch for live revocation by admin
          unsubRevokeWatch = WorkspaceService.subscribeToUserApprovalStatus(targetUser.uid, targetUser.email, stillApproved => {
            if (!stillApproved) {
              if (activeListenersCleanupRef.current) {
                activeListenersCleanupRef.current();
                activeListenersCleanupRef.current = null;
              }
              showToast('L\'accesso è stato revocato dall\'amministratore.');
              attachWaitingModeListeners(targetUser);
            }
          });
        }

        // Auto-sync local notes to Cloud Firestore in background without annoying popups
        const hasCloudData = await WorkspaceService.checkHasCloudData(targetUser.uid);
        const localPages = WorkspaceService.getLocalPages();
        const hasLocalData = Object.keys(localPages).some(sub => (localPages[sub] || []).length > 0);

        if (!hasCloudData && hasLocalData) {
          WorkspaceService.migrateLocalDataToCloud(targetUser.uid).then(result => {
            if (result.pagesCount > 0) {
              console.log(`Appunti auto-sincronizzati su Cloud Firestore (${result.pagesCount} pagine).`);
            }
          }).catch(() => {});
        }

        // Subscribe to Realtime Firestore updates
        const unsubFirestore = WorkspaceService.subscribeToUserData(targetUser.uid, {
          onPreferences: pref => {
            if (pref.bgIndex !== undefined) setBgIndex(pref.bgIndex);
            if (pref.isImmersion !== undefined) setIsImmersion(pref.isImmersion);
            if (pref.isSidebarCollapsed !== undefined) setIsSidebarCollapsed(pref.isSidebarCollapsed);
            if (pref.isChatCollapsed !== undefined) setIsChatCollapsed(pref.isChatCollapsed);
            if (pref.selectedModel !== undefined) setSelectedModel(pref.selectedModel);
            if (pref.fontFamily !== undefined) setFontFamily(pref.fontFamily);
            if (pref.fontSize !== undefined) setFontSize(pref.fontSize);
            if (pref.showWeatherWidget !== undefined) setShowWeatherWidget(pref.showWeatherWidget);
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
          if (unsubRevokeWatch) unsubRevokeWatch();
        };
      };

      if (!userIsApproved) {
        attachWaitingModeListeners(user);
        return;
      }

      setCloudSyncActive(true);
      showToast(`Benvenuto, ${user.displayName || user.email}! Sincronizzazione cloud attiva.`, 'info');
      startCloudSyncForUser(user, isUserSuperAdmin);
    });

    return () => {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      unsubscribe();
    };
  }, [openCustomDialog, showToast]);

  // Subscribe to user's joined rooms
  useEffect(() => {
    if (!currentUser || !isApproved) {
      setUserRooms([]);
      return;
    }
    const unsub = WorkspaceService.subscribeToUserRooms(currentUser.uid, (rooms) => {
      setUserRooms(rooms);
      if (rooms.length > 0 && (!activeRoomId || !rooms.some(r => r.id === activeRoomId))) {
        setActiveRoomId(rooms[0].id);
      }
    });
    return () => unsub();
  }, [currentUser, activeRoomId, isApproved]);

  // Subscribe to active room data (pages, messages, materials)
  useEffect(() => {
    if (workspaceMode !== 'shared' || !activeRoomId || !currentUser || !isApproved) {
      return;
    }
    const unsubPages = WorkspaceService.subscribeToRoomPages(activeRoomId, (rPages) => {
      setActiveRoomPages(rPages);
      if (rPages.length > 0 && (!activeRoomPageId || !rPages.some(p => p.id === activeRoomPageId))) {
        setActiveRoomPageId(rPages[0].id);
      }
    });
    const unsubMsgs = WorkspaceService.subscribeToRoomMessages(activeRoomId, (msgs) => {
      setActiveRoomMessages(msgs);
    });
    const unsubMats = WorkspaceService.subscribeToRoomMaterials(activeRoomId, (mats) => {
      setActiveRoomMaterials(mats);
    });
    return () => {
      unsubPages();
      unsubMsgs();
      unsubMats();
    };
  }, [workspaceMode, activeRoomId, currentUser, activeRoomPageId]);

  // Sync active page content into editor (handles both personal workspace and shared room modes)
  useEffect(() => {
    if (workspaceMode === 'shared') {
      let currentRoomPage = activeRoomPages.find(p => p.id === activeRoomPageId);
      if (!currentRoomPage && activeRoomPages.length > 0) {
        currentRoomPage = activeRoomPages[0];
        setActiveRoomPageId(currentRoomPage.id);
      }
      const targetContent = currentRoomPage ? currentRoomPage.content : '';
      if (notesAreaRef.current && notesAreaRef.current.innerHTML !== targetContent) {
        notesAreaRef.current.innerHTML = targetContent;
      }
      return;
    }

    const currentSubPages = pages[activeSubject] || [];
    let currentPage = currentSubPages.find(p => p.id === activePageId);
    if (!currentPage && currentSubPages.length > 0) {
      currentPage = currentSubPages[0];
      setActivePageId(currentPage.id);
    }
    const targetContent = currentPage ? currentPage.content : '';
    if (notesAreaRef.current && notesAreaRef.current.innerHTML !== targetContent) {
      notesAreaRef.current.innerHTML = targetContent;
    }
    // Update drive link for active subject
    const currentSub = subjects.find(s => s.id === activeSubject);
    setDriveLink(currentSub?.driveLink || '');
  }, [workspaceMode, activeSubject, activePageId, pages, subjects, activeRoomPages, activeRoomPageId, authLoading, activeTab]);

  // Scroll chat messages to bottom on new message or tab opening
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chats, activeSubject, isChatCollapsed, activeRoomMessages, workspaceMode]);

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

  // Immediate logout from waiting modal without confirmation dialog
  const handleImmediateLogoutFromWaitScreen = async () => {
    try {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      await signOut(auth);
    } catch (e) {
      // Ignore signout error
    } finally {
      setCurrentUser(null);
      setIsApproved(false);
      setIsAdmin(false);
      setCloudSyncActive(false);
      showToast('Disconnesso con successo.');
    }
  };

  // Immediate switch account from waiting modal
  const handleImmediateSwitchAccount = async () => {
    try {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      await signOut(auth);
      setCurrentUser(null);
      setIsApproved(false);
      setIsAdmin(false);
      setCloudSyncActive(false);
      // Immediately open Google Login popup
      await handleGoogleLogin();
    } catch (e) {
      // Ignore switch account error
    }
  };

  // Background selection from settings
  const handleSelectBgIndex = (nextIdx: number) => {
    setBgIndex(nextIdx);
    WorkspaceService.saveLocalPreferences({ bgIndex: nextIdx });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { bgIndex: nextIdx });
    }
  };

  // Font customization handlers
  const handleSelectFontFamily = (font: string) => {
    setFontFamily(font);
    WorkspaceService.saveLocalPreferences({ fontFamily: font });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { fontFamily: font });
    }
  };

  const handleSelectFontSize = (size: number) => {
    setFontSize(size);
    WorkspaceService.saveLocalPreferences({ fontSize: size });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { fontSize: size });
    }
  };

  // Weather widget visibility toggle
  const handleToggleWeatherWidget = (show: boolean) => {
    setShowWeatherWidget(show);
    WorkspaceService.saveLocalPreferences({ showWeatherWidget: show });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { showWeatherWidget: show });
    }
  };

  // Model & API Key handlers for SettingsModal
  const handleSelectModel = (model: string) => {
    setSelectedModel(model);
    WorkspaceService.saveLocalPreferences({ selectedModel: model });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { selectedModel: model });
    }
  };

  const handleAddApiKey = async (key: string) => {
    const updated = [...apiKeys, key];
    setApiKeys(updated);
    const newIdx = updated.length - 1;
    setSelectedKeyIndex(newIdx);
    WorkspaceService.saveLocalApiKeys(updated, newIdx);
    if (currentUser) {
      await WorkspaceService.saveApiKeysToCloud(currentUser.uid, updated, newIdx);
    }
    showToast('Chiave API aggiunta con successo!');
  };

  const handleRemoveApiKey = async (idx: number) => {
    const updated = apiKeys.filter((_, i) => i !== idx);
    const newIdx = Math.max(0, Math.min(selectedKeyIndex, updated.length - 1));
    setApiKeys(updated);
    setSelectedKeyIndex(newIdx);
    WorkspaceService.saveLocalApiKeys(updated, newIdx);
    if (currentUser) {
      await WorkspaceService.saveApiKeysToCloud(currentUser.uid, updated, newIdx);
    }
    showToast('Chiave API rimossa.');
  };

  const handleSelectApiKeyIndex = async (idx: number) => {
    setSelectedKeyIndex(idx);
    WorkspaceService.saveLocalApiKeys(apiKeys, idx);
    if (currentUser) {
      await WorkspaceService.saveApiKeysToCloud(currentUser.uid, apiKeys, idx);
    }
    showToast(`Chiave #${idx + 1} attiva.`);
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

  // Save current note content (debounced to cloud, instant to local or shared room)
  const handleEditorInput = () => {
    if (!notesAreaRef.current) return;
    const content = notesAreaRef.current.innerHTML;

    if (workspaceMode === 'shared') {
      if (!activeRoomId || !activeRoomPageId) return;
      // Update local room state immediately
      setActiveRoomPages(prev =>
        prev.map(p => (p.id === activeRoomPageId ? { ...p, content } : p))
      );
      // Debounce real-time write to shared room
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        const page = activeRoomPages.find(p => p.id === activeRoomPageId);
        if (page) {
          await WorkspaceService.saveRoomPage(activeRoomId, {
            ...page,
            content
          });
        }
      }, 500);
      return;
    }

    // Update local personal state immediately
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

  // ==========================================
  // SHARED ROOMS & COLLABORATION HANDLERS
  // ==========================================

  const handleCreateRoom = async () => {
    if (!currentUser) return;
    if (!newRoomName.trim()) {
      showToast('Inserisci un nome per la stanza di gruppo.', 'error');
      return;
    }
    setRoomActionLoading(true);
    try {
      const room = await WorkspaceService.createSharedRoom(currentUser, newRoomName.trim());
      setActiveRoomId(room.id);
      setWorkspaceMode('shared');
      setIsRoomModalOpen(false);
      setNewRoomName('');
      showToast(`Stanza "${room.name}" creata! Codice invito: ${room.code}`);
    } catch (e: any) {
      showToast('Errore creazione stanza: ' + (e.message || 'Riprova'), 'error');
    } finally {
      setRoomActionLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!currentUser) return;
    if (!joinRoomCode.trim()) {
      showToast('Inserisci il codice della stanza (es. ITS-1234).', 'error');
      return;
    }
    setRoomActionLoading(true);
    try {
      const room = await WorkspaceService.joinSharedRoomByCode(currentUser, joinRoomCode.trim());
      setActiveRoomId(room.id);
      setWorkspaceMode('shared');
      setIsRoomModalOpen(false);
      setJoinRoomCode('');
      showToast(`Ti sei unito alla stanza "${room.name}"!`);
    } catch (e: any) {
      showToast(e.message || 'Errore durante l\'accesso alla stanza.', 'error');
    } finally {
      setRoomActionLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentUser || !activeRoomId) return;
    const room = userRooms.find(r => r.id === activeRoomId);
    const confirmed = await openCustomDialog({
      title: '🚪 Abbandona Stanza',
      description: `Sei sicuro di voler uscire dalla stanza di gruppo <b>"${room?.name || 'questa stanza'}"</b>?`,
      confirmText: 'Abbandona',
      danger: true
    });
    if (confirmed) {
      const leavingId = activeRoomId;
      await WorkspaceService.leaveSharedRoom(leavingId, currentUser.uid);
      showToast('Sei uscito dalla stanza di gruppo.');
      const remaining = userRooms.filter(r => r.id !== leavingId);
      setUserRooms(remaining);
      if (remaining.length > 0) {
        setActiveRoomId(remaining[0].id);
      } else {
        setActiveRoomId('');
        setWorkspaceMode('personal');
      }
    }
  };

  const handleDeleteRoom = async () => {
    if (!currentUser || !activeRoomId || !activeRoom) return;
    if (activeRoom.createdBy !== currentUser.uid && !isAdmin) {
      showToast('Solo il creatore della stanza può eliminarla.', 'error');
      return;
    }
    const confirmed = await openCustomDialog({
      title: '🗑️ Elimina Stanza di Gruppo',
      description: `Sei il creatore di <b>"${activeRoom.name}"</b>.<br/><br/><span style="color: #ef4444; font-size: 0.85rem;">⚠️ Vuoi eliminare definitivamente questa stanza e tutti i suoi appunti, materiali e messaggi per tutti i partecipanti? L'azione non è reversibile.</span>`,
      confirmText: 'Elimina Definitivamente',
      danger: true
    });
    if (confirmed) {
      const deletingId = activeRoomId;
      await WorkspaceService.deleteSharedRoom(deletingId);
      showToast(`Stanza "${activeRoom.name}" eliminata con successo.`);
      const remaining = userRooms.filter(r => r.id !== deletingId);
      setUserRooms(remaining);
      if (remaining.length > 0) {
        setActiveRoomId(remaining[0].id);
      } else {
        setActiveRoomId('');
        setWorkspaceMode('personal');
      }
    }
  };

  const handleCopyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast(`Codice "${code}" copiato negli appunti! Condividilo con i compagni.`);
  };

  const handleAddNewRoomPage = async () => {
    if (!activeRoomId) return;
    const pageName = await openCustomDialog({
      title: '📝 Nuova Scheda di Gruppo',
      description: 'Crea una nuova scheda di appunti visibile a tutti i membri della stanza.',
      fields: [{ placeholder: 'Titolo scheda...', value: `Pagina ${activeRoomPages.length + 1}` }],
      confirmText: 'Crea Scheda'
    });

    if (pageName && pageName.trim()) {
      const newPage: PageItem = {
        id: 'rpage_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: pageName.trim(),
        content: `<h3>${pageName.trim()}</h3><p>Inizia a scrivere con i tuoi compagni...</p>`,
        order: activeRoomPages.length
      };

      await WorkspaceService.saveRoomPage(activeRoomId, newPage);
      setActiveRoomPageId(newPage.id);
      showToast(`Scheda "${pageName.trim()}" aggiunta alla stanza!`);
    }
  };

  const handleDeleteRoomPage = async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeRoomId) return;
    if (activeRoomPages.length <= 1) {
      showToast("Impossibile eliminare l'unica scheda rimasta nella stanza.", 'error');
      return;
    }
    const targetPage = activeRoomPages.find(p => p.id === pageId);
    const confirmed = await openCustomDialog({
      title: '🗑️ Elimina Scheda Condivisa',
      description: `Vuoi davvero eliminare la scheda <b>"${targetPage?.name || ''}"</b> per tutti i partecipanti?`,
      confirmText: 'Elimina Scheda',
      danger: true
    });

    if (confirmed) {
      await WorkspaceService.deleteRoomPage(activeRoomId, pageId);
      const remaining = activeRoomPages.filter(p => p.id !== pageId);
      if (activeRoomPageId === pageId) {
        setActiveRoomPageId(remaining[0]?.id || '');
      }
      showToast('Scheda condivisa eliminata.');
    }
  };

  const handleRenameRoomPage = async (pageId: string) => {
    if (!activeRoomId) return;
    const page = activeRoomPages.find(p => p.id === pageId);
    if (!page) return;

    const newName = await openCustomDialog({
      title: '✏️ Rinomina Scheda Condivisa',
      description: 'Inserisci il nuovo titolo per questa scheda visibile a tutti.',
      fields: [{ placeholder: 'Titolo scheda...', value: page.name }],
      confirmText: 'Salva'
    });

    if (newName && newName.trim()) {
      await WorkspaceService.saveRoomPage(activeRoomId, {
        ...page,
        name: newName.trim()
      });
      showToast('Scheda rinominata per il gruppo!');
    }
  };

  // PWA Install Button Handler
  const handleInstallAppClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        showToast('🎉 Workspace ITS installata sul tuo dispositivo!');
      }
      return;
    }

    const isInIframe = window.self !== window.top;
    const confirmed = await openCustomDialog({
      title: '💻 Scarica App su Desktop / Dispositivo',
      description: isInIframe
        ? `Per installare <b>Workspace ITS</b> sul Desktop come applicazione nativa, apri prima il sito in una scheda dedicata del browser (Chrome o Edge) e premi il pulsante <b>"Scarica App"</b> o l'icona di installazione nella barra degli indirizzi.<br/><br/>Una volta installata, il pulsante scomparirà automaticamente!`
        : `Puoi installare <b>Workspace ITS</b> direttamente dal tuo browser:<br/><br/>• <b>Su PC (Chrome / Edge):</b> clicca sull'icona <b>Installa App (⊕)</b> a destra nella barra degli indirizzi.<br/>• <b>Su iPhone / iPad (Safari):</b> premi <b>Condividi</b> e seleziona <b>Aggiungi alla schermata Home</b>.<br/><br/>Una volta scaricata, il tasto scomparirà automaticamente.`,
      confirmText: isInIframe ? '↗ Apri in Scheda Dedicata' : 'Ho capito'
    });

    if (confirmed && isInIframe) {
      const a = document.createElement('a');
      a.href = window.location.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Rich Text Formatting helper (preserves selection & supports CSS colors/highlights)
  const handleFormatText = (command: string, value: string | undefined = undefined) => {
    if (notesAreaRef.current) {
      notesAreaRef.current.focus();
    }
    if (command === 'hiliteColor' || command === 'foreColor') {
      try {
        document.execCommand('styleWithCSS', false, 'true');
      } catch {
        // Ignore if unsupported
      }
      const ok = document.execCommand(command, false, value);
      if (!ok && command === 'hiliteColor') {
        document.execCommand('backColor', false, value);
      }
    } else {
      document.execCommand(command, false, value);
    }
    handleEditorInput();
  };

  // Helper to format material file names cleanly
  const formatMaterialDisplayName = (rawName: string) => {
    if (!rawName) return 'Documento senza titolo';
    return rawName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // Materials: Rename Resource
  const handleRenameMaterial = async (material: MaterialItem) => {
    const newName = await openCustomDialog({
      title: '✏️ Rinomina File / Risorsa',
      description: 'Inserisci un nome chiaro e leggibile per questo materiale.',
      fields: [{ placeholder: 'Nome del documento...', value: material.name }],
      confirmText: 'Salva Nome'
    });

    if (newName && newName.trim()) {
      const updatedItem: MaterialItem = { ...material, name: newName.trim() };

      if (chatSelectedMaterial && String(chatSelectedMaterial.id) === String(material.id)) {
        setChatSelectedMaterial(updatedItem);
      }

      if (workspaceMode === 'shared') {
        if (!activeRoomId) return;
        setActiveRoomMaterials(prev =>
          prev.map(m => (String(m.id) === String(material.id) ? updatedItem : m))
        );
        await WorkspaceService.saveRoomMaterial(activeRoomId, updatedItem);
        showToast('Nome del file aggiornato per il gruppo!');
        return;
      }

      const currentSubMaterials = materials[activeSubject] || [];
      const updatedList = currentSubMaterials.map(m =>
        String(m.id) === String(material.id) ? updatedItem : m
      );
      const nextMaterials = { ...materials, [activeSubject]: updatedList };
      setMaterials(nextMaterials);
      WorkspaceService.saveLocalMaterials(nextMaterials);

      if (currentUser) {
        await WorkspaceService.saveMaterialToCloud(currentUser.uid, activeSubject, updatedItem);
      }
      showToast('Nome del file aggiornato!');
    }
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
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      setUploadingFile({
        name: cleanName || file.name,
        originalName: file.name,
        size: file.size,
        base64: base64Url,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
        fileType: isPdf ? 'pdf' : isImg ? 'image' : 'doc'
      });
      if (!customMaterialName) {
        setCustomMaterialName(cleanName || file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Materials: Save Resource (File or Link) - Works for Personal & Shared Room
  const handleSaveMaterial = async () => {
    if (addMaterialTab === 'file') {
      if (!uploadingFile) {
        showToast('Seleziona prima un file da caricare.', 'error');
        return;
      }
      const matId = 'mat_' + Date.now();
      const name = customMaterialName.trim() || uploadingFile.name;
      // CRITICAL FIX: url MUST be a small identifier (like 'local_storage') so it does not exceed Firestore's 2048-char security rule
      const newMaterial: MaterialItem = {
        id: matId,
        name,
        url: 'local_storage',
        category: (customMaterialCategory || (workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni')).trim(),
        createdAt: new Date().toISOString(),
        fileType: uploadingFile.fileType,
        fileSize: uploadingFile.size,
        mimeType: uploadingFile.mimeType,
        fileData: uploadingFile.base64.length < 500000 ? uploadingFile.base64 : '',
        hasLocalFile: true
      };

      // Store complete file in IndexedDB for instant preview & offline availability
      await saveFileToIndexedDB(matId, uploadingFile.base64);

      if (workspaceMode === 'shared') {
        if (!activeRoomId) {
          showToast('Nessuna stanza selezionata.', 'error');
          return;
        }
        setActiveRoomMaterials(prev => [...prev, newMaterial]);
        await WorkspaceService.saveRoomMaterial(activeRoomId, newMaterial);
        setIsAddMaterialModalOpen(false);
        setUploadingFile(null);
        showToast(`Documento "${newMaterial.name}" condiviso con il gruppo!`);
        return;
      }

      // Personal workspace save
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
      showToast(`Documento "${newMaterial.name}" salvato nei tuoi materiali!`);
    } else {
      // Link Tab
      if (!customMaterialName.trim() || !customMaterialUrl.trim()) {
        showToast('Inserisci sia il nome che il link.', 'error');
        return;
      }
      let url = customMaterialUrl.trim();
      const driveId = extractGoogleDriveId(url);
      if (driveId) {
        url = `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;
      }
      const isDrive = Boolean(driveId) || url.includes('drive.google.com');
      const isPdf = url.toLowerCase().includes('.pdf');
      const matId = 'mat_' + Date.now();
      const newMaterial: MaterialItem = {
        id: matId,
        name: customMaterialName.trim(),
        url,
        category: (customMaterialCategory || (workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni')).trim(),
        createdAt: new Date().toISOString(),
        fileType: isDrive ? 'link' : isPdf ? 'pdf' : 'link',
        hasLocalFile: false
      };

      if (workspaceMode === 'shared') {
        if (!activeRoomId) {
          showToast('Nessuna stanza selezionata.', 'error');
          return;
        }
        setActiveRoomMaterials(prev => [...prev, newMaterial]);
        await WorkspaceService.saveRoomMaterial(activeRoomId, newMaterial);
        setIsAddMaterialModalOpen(false);
        showToast(`Risorsa "${newMaterial.name}" condivisa con il gruppo!`);
        return;
      }

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
    const driveId = extractGoogleDriveId(material.url);

    if (driveId) {
      setPreviewDriveId(driveId);
      resolvedUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    } else {
      setPreviewDriveId(null);
      // Check if we have fileData in Firestore
      if (material.fileData && material.fileData.startsWith('data:')) {
        if (material.fileData.includes('application/pdf') || material.fileType === 'pdf') {
          resolvedUrl = base64ToBlobUrl(material.fileData, 'application/pdf');
        } else {
          resolvedUrl = material.fileData;
        }
      } else {
        // Check IndexedDB
        const localData = await getFileFromIndexedDB(String(material.id));
        if (localData) {
          if (typeof localData === 'string' && localData.startsWith('data:')) {
            if (localData.includes('application/pdf') || material.fileType === 'pdf') {
              resolvedUrl = base64ToBlobUrl(localData, 'application/pdf');
            } else {
              resolvedUrl = localData;
            }
          } else if (localData instanceof Blob) {
            resolvedUrl = URL.createObjectURL(localData);
          }
        }
      }
    }

    if (!resolvedUrl || resolvedUrl === 'local_storage') {
      const fallbackDriveId = extractGoogleDriveId(material.url);
      if (fallbackDriveId) {
        resolvedUrl = `https://drive.google.com/file/d/${fallbackDriveId}/preview`;
        setPreviewDriveId(fallbackDriveId);
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
      description: 'Sei sicuro di voler rimuovere questo file dalla libreria?',
      confirmText: 'Elimina',
      danger: true
    });

    if (confirmed) {
      await deleteFileFromIndexedDB(String(materialId));
      if (chatSelectedMaterial && String(chatSelectedMaterial.id) === String(materialId)) {
        setChatSelectedMaterial(null);
      }

      if (workspaceMode === 'shared') {
        if (activeRoomId) {
          setActiveRoomMaterials(prev => prev.filter(m => String(m.id) !== String(materialId)));
          await WorkspaceService.deleteRoomMaterial(activeRoomId, materialId);
        }
        showToast('Risorsa rimossa dalla stanza.');
        return;
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

  // Google Drive API Key Persistence Handler
  const handleSaveGoogleDriveApiKey = (key: string) => {
    setGoogleDriveApiKey(key);
    localStorage.setItem('workspace_gdrive_api_key', key);
  };

  // Google Drive Materials Batch Import Handler
  const handleImportDriveMaterials = async (newItems: MaterialItem[]) => {
    if (newItems.length === 0) return;

    if (workspaceMode === 'shared') {
      if (!activeRoomId) {
        showToast('Nessuna stanza selezionata.', 'error');
        return;
      }
      setActiveRoomMaterials(prev => [...prev, ...newItems]);
      for (const item of newItems) {
        await WorkspaceService.saveRoomMaterial(activeRoomId, item);
      }
      return;
    }

    // Personal workspace
    const currentSubMaterials = materials[activeSubject] || [];
    const updated = {
      ...materials,
      [activeSubject]: [...currentSubMaterials, ...newItems]
    };
    setMaterials(updated);
    WorkspaceService.saveLocalMaterials(updated);

    if (currentUser) {
      for (const item of newItems) {
        await WorkspaceService.saveMaterialToCloud(currentUser.uid, activeSubject, item);
      }
    }
  };

  const [isSavingToDrive, setIsSavingToDrive] = useState(false);

  // Request Google Drive OAuth token for saving notes to user's Drive
  const handleAuthorizeGoogleDrive = async (): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({
        prompt: 'consent'
      });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setGoogleOAuthAccessToken(token);
        if (result.user) {
          const isSuper = WorkspaceService.isSuperAdmin(result.user.email, result.user.displayName);
          if (isSuper) {
            setIsApproved(true);
            setIsAdmin(true);
            WorkspaceService.cleanupSuperAdminRecords(result.user);
          }
        }
        return token;
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error('Drive OAuth error:', err);
        showToast(`Errore autorizzazione Google: ${err.message || 'Riprova'}`, 'error');
      }
    }
    return null;
  };

  // Save current note to personal Google Drive
  const handleSaveNoteToGoogleDrive = async () => {
    const currentSubPages = pages[activeSubject] || [];
    const currentPage = currentSubPages.find(p => p.id === activePageId) || currentSubPages[0];
    const noteTitle = workspaceMode === 'shared'
      ? (activeRoomPages.find(p => p.id === activeRoomPageId)?.name || 'Appunti Condivisi')
      : (currentPage?.name || 'Appunti');
    const content = notesAreaRef.current?.innerHTML || (currentPage?.content || '');

    if (!content.trim() || content === '<p><br></p>') {
      showToast('L\'appunto è vuoto: scrivi del testo prima di salvarlo su Drive.', 'error');
      return;
    }

    setIsSavingToDrive(true);
    try {
      let token = googleOAuthAccessToken;
      if (!token) {
        showToast('Connetti il tuo account Google personale per salvare l\'appunto...', 'info');
        token = await handleAuthorizeGoogleDrive();
      }

      if (!token) {
        showToast('Salvataggio su Drive annullato.', 'error');
        return;
      }

      const subjectName = workspaceMode === 'shared' ? (activeRoom?.name || 'Stanza ITS') : activeSubject;
      const res = await uploadNoteToDrive(token, noteTitle, content, subjectName);

      if (res.webViewLink) {
        showToast(`✨ Salvato su Google Drive: "${res.name}"!`);
      } else {
        showToast(`✨ Salvato con successo nel tuo Google Drive!`);
      }
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      if (err.message && (err.message.includes('401') || err.message.includes('auth'))) {
        setGoogleOAuthAccessToken(null);
        showToast('Sessione Google scaduta. Riconnetti il tuo account e riprova.', 'error');
      } else {
        showToast(`Errore salvataggio su Drive: ${err.message}`, 'error');
      }
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // Download note as HTML file
  const handleDownloadNoteFile = () => {
    const currentSubPages = pages[activeSubject] || [];
    const currentPage = currentSubPages.find(p => p.id === activePageId) || currentSubPages[0];
    const noteTitle = workspaceMode === 'shared'
      ? (activeRoomPages.find(p => p.id === activeRoomPageId)?.name || 'Appunti_Condivisi')
      : (currentPage?.name || 'Appunti');
    const content = notesAreaRef.current?.innerHTML || (currentPage?.content || '');

    const subjectName = workspaceMode === 'shared' ? (activeRoom?.name || 'Stanza_ITS') : activeSubject;
    const cleanFileName = `${subjectName}_${noteTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${noteTitle} - ${subjectName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; background: #ffffff; }
    h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .meta { font-size: 0.85rem; color: #64748b; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>${noteTitle}</h1>
  <div class="meta">Materia: <b>${subjectName}</b> • Esportato il ${new Date().toLocaleString('it-IT')} da Workspace ITS</div>
  <div>${content}</div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanFileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Appunto "${noteTitle}" scaricato come file!`);
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

    // If in Shared Room Mode, send message to room and broadcast Gemini's response to all participants
    if (workspaceMode === 'shared') {
      if (!activeRoomId) {
        showToast('Seleziona o crea prima una stanza di gruppo!', 'error');
        return;
      }
      const currentRoom = userRooms.find(r => r.id === activeRoomId);
      const userMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const rawMsgText = isAnalysis ? `🔍 ${userText}` : chatSelectedMaterial ? `[📎 ${chatSelectedMaterial.name}] ${userText}` : userText;

      const sharedUserMsg: SharedChatMessage = {
        id: userMsgId,
        role: 'user',
        senderId: currentUser?.uid || 'anon',
        senderName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Studente',
        senderPhoto: currentUser?.photoURL || '',
        parts: userParts,
        rawText: rawMsgText,
        timestamp: Date.now()
      };

      // Broadcast user question to all members in the room
      await WorkspaceService.sendRoomMessage(activeRoomId, sharedUserMsg);
      if (!customPrompt) setChatInput('');
      setIsAILoading(true);

      const noteText = notesAreaRef.current?.innerText.trim() || '';
      let systemContext = `Sei l'assistente AI ITS del gruppo di studio "${currentRoom?.name || 'Stanza ITS'}". Rispondi in italiano in modo chiaro, utile e accademico.`;
      if (noteText) {
        systemContext += `\n\nAppunti condivisi della stanza:\n${noteText}`;
      }
      if (chatSelectedMaterial) {
        systemContext += `\n\n[FONTE CONDIVISA COLLEGATA]: "${chatSelectedMaterial.name}". Rispondi facendo riferimento a questa fonte.`;
      }

      // Context history for AI: recent messages from room
      const recentRoomMsgs = activeRoomMessages.slice(-10);
      const promptContents = [
        ...recentRoomMsgs.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: m.parts || [{ text: m.rawText || '' }]
        })),
        {
          role: 'user',
          parts: userParts
        }
      ];

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
                contents: promptContents
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
              continue;
            }
            throw new Error(errMsg || 'Errore durante la richiesta AI.');
          }

          if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            const aiText = data.candidates[0].content.parts[0].text;
            setLastAIResponse(aiText);

            const aiMsgId = 'ai_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            const sharedAiMsg: SharedChatMessage = {
              id: aiMsgId,
              role: 'model',
              senderId: 'gemini',
              senderName: 'Gemini Copilot ✦',
              parts: [{ text: aiText }],
              rawText: aiText,
              timestamp: Date.now()
            };

            // Broadcast AI response to the room for all students to see!
            await WorkspaceService.sendRoomMessage(activeRoomId, sharedAiMsg);
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
        const errorMsgId = 'err_' + Date.now();
        await WorkspaceService.sendRoomMessage(activeRoomId, {
          id: errorMsgId,
          role: 'model',
          senderId: 'system',
          senderName: 'Avviso di Sistema',
          parts: [{ text: `⚠️ **Attenzione:** ${lastErrorMessage || 'Impossibile completare la richiesta AI.'}` }],
          rawText: lastErrorMessage,
          timestamp: Date.now()
        });
      }
      return;
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

          setAttachedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          success = true;

          if (currentUser) {
            WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, finalChatList).catch(err => {
              console.warn('Background chat cloud sync error:', err);
            });
          }
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

  // Import backup data (supports both structured export, raw localStorage dump, and legacy notes)
  const handleImportBackupData = async (data: any) => {
    try {
      let parsed = data;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed.trim());
      }

      let importedPages: Record<string, PageItem[]> = {};
      let importedSubjects: SubjectItem[] = [];
      let importedMaterials: Record<string, MaterialItem[]> = {};
      let importedChats: Record<string, ChatMessage[]> = {};

      // Case 1: Structured backup exported from this app
      if (parsed.subjects && parsed.pages) {
        importedSubjects = parsed.subjects || [];
        importedPages = parsed.pages || {};
        importedMaterials = parsed.materials || {};
        importedChats = parsed.chats || {};
      }
      // Case 2: Raw localStorage dump { workspace_pages, workspace_notes, etc. }
      else if (parsed.workspace_pages || parsed.workspace_notes) {
        if (parsed.workspace_pages) {
          importedPages = typeof parsed.workspace_pages === 'string'
            ? JSON.parse(parsed.workspace_pages)
            : parsed.workspace_pages;
        }
        if (parsed.workspace_notes) {
          const oldNotes = typeof parsed.workspace_notes === 'string'
            ? JSON.parse(parsed.workspace_notes)
            : parsed.workspace_notes;
          for (const sub in oldNotes) {
            if (!importedPages[sub] || importedPages[sub].length === 0) {
              importedPages[sub] = [{
                id: 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                name: 'Appunti Principali',
                content: oldNotes[sub] || ''
              }];
            }
          }
        }
        if (parsed.workspace_materials) {
          importedMaterials = typeof parsed.workspace_materials === 'string'
            ? JSON.parse(parsed.workspace_materials)
            : parsed.workspace_materials;
        }
        if (parsed.workspace_chats) {
          importedChats = typeof parsed.workspace_chats === 'string'
            ? JSON.parse(parsed.workspace_chats)
            : parsed.workspace_chats;
        }
        const driveLinks = parsed.workspace_drive_links
          ? (typeof parsed.workspace_drive_links === 'string' ? JSON.parse(parsed.workspace_drive_links) : parsed.workspace_drive_links)
          : {};
        importedSubjects = Object.keys(importedPages).map(name => ({
          id: name,
          name,
          driveLink: driveLinks[name] || ''
        }));
      }
      // Case 3: Simple notes dictionary { "Database": "content...", "Reti": "..." }
      else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const sub in parsed) {
          const content = typeof parsed[sub] === 'string' ? parsed[sub] : JSON.stringify(parsed[sub]);
          importedPages[sub] = [{
            id: 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            name: 'Appunti Principali',
            content
          }];
          importedSubjects.push({ id: sub, name: sub, driveLink: '' });
        }
      }

      if (Object.keys(importedPages).length === 0) {
        throw new Error('Nessun dato di appunti o materie trovato nel file o testo fornito.');
      }

      if (importedSubjects.length === 0) {
        importedSubjects = Object.keys(importedPages).map(s => ({ id: s, name: s, driveLink: '' }));
      }

      const firstSub = importedSubjects[0].id;
      const firstPageId = importedPages[firstSub]?.[0]?.id || '';

      // Update React state
      setSubjects(importedSubjects);
      setPages(importedPages);
      setMaterials(importedMaterials);
      setChats(importedChats);
      setActiveSubject(firstSub);
      setActivePageId(firstPageId);

      // Save to localStorage
      WorkspaceService.saveLocalPages(importedPages);
      WorkspaceService.saveLocalMaterials(importedMaterials);
      WorkspaceService.saveLocalChats(importedChats);
      WorkspaceService.saveLocalPreferences({
        activeSubject: firstSub,
        activePageId: firstPageId
      });

      // If user is currently signed in, also sync immediately to Cloud Firestore!
      if (currentUser) {
        for (const sub of importedSubjects) {
          await WorkspaceService.saveSubjectToCloud(currentUser.uid, sub);
          const pList = importedPages[sub.id] || [];
          for (const page of pList) {
            await WorkspaceService.savePageToCloud(currentUser.uid, sub.id, page);
          }
          const mList = importedMaterials[sub.id] || [];
          for (const mat of mList) {
            await WorkspaceService.saveMaterialToCloud(currentUser.uid, sub.id, mat);
          }
          const cList = importedChats[sub.id] || [];
          if (cList.length > 0) {
            await WorkspaceService.saveChatToCloud(currentUser.uid, sub.id, cList);
          }
        }
        await WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, {
          activeSubject: firstSub,
          activePageId: firstPageId
        });
      }

      setIsBackupModalOpen(false);
      setBackupPasteText('');
      showToast(`Backup ripristinato con successo: ${importedSubjects.length} materie caricate!`);
    } catch (err: any) {
      console.error('Backup import error:', err);
      showToast('Errore importazione backup: ' + (err.message || 'Formato non valido'), 'error');
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        await handleImportBackupData(text);
      } catch (err: any) {
        showToast('Errore durante la lettura del file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Active Subject Pages
  const currentSubPages = pages[activeSubject] || [];
  const currentSubMaterials = materials[activeSubject] || [];
  const currentSubChats = chats[activeSubject] || [];

  // Active Shared Room derivation
  const activeRoom = userRooms.find(r => r.id === activeRoomId) || null;
  const activeRoomMemberList = activeRoom && activeRoom.members ? Object.values(activeRoom.members) : [];

  // Group materials by category (Personal vs Shared Room)
  const groupedPersonalMaterials: Record<string, MaterialItem[]> = {};
  currentSubMaterials.forEach(m => {
    const cat = m.category || 'Lezioni';
    if (!groupedPersonalMaterials[cat]) groupedPersonalMaterials[cat] = [];
    groupedPersonalMaterials[cat].push(m);
  });

  const groupedRoomMaterials: Record<string, MaterialItem[]> = {};
  activeRoomMaterials.forEach(m => {
    const cat = m.category || 'Condivisi';
    if (!groupedRoomMaterials[cat]) groupedRoomMaterials[cat] = [];
    groupedRoomMaterials[cat].push(m);
  });

  const activeDisplayMaterials = workspaceMode === 'shared' ? activeRoomMaterials : currentSubMaterials;
  const activeGroupedMaterials = workspaceMode === 'shared' ? groupedRoomMaterials : groupedPersonalMaterials;

  // 1. Loading screen while Firebase Auth initializes
  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-spinner"></div>
        <p>Caricamento Workspace ITS...</p>
      </div>
    );
  }

  // 2. Auth Gate: Until the user logs in, they cannot write notes, view or do anything
  if (!currentUser) {
    return (
      <div className="auth-gate-container">
        {/* Top Header */}
        <div className="auth-gate-header">
          <div className="auth-gate-brand">
            <span style={{ fontSize: '1.4rem' }}>📚</span>
            <span>Workspace ITS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isInstalled && (
              <button
                className="top-btn top-btn-install"
                onClick={handleInstallAppClick}
                title="Scarica e installa Workspace ITS sul desktop o dispositivo"
              >
                💻 Scarica App
              </button>
            )}
            <button
              className="top-btn"
              onClick={() => setIsBackupModalOpen(true)}
              title="Importa backup dati offline"
            >
              💾 Ripristina Backup
            </button>
          </div>
        </div>

        {/* Center Hero Card */}
        <div className="auth-gate-card">
          <div className="auth-gate-badge">
            <span className="auth-gate-dot"></span> Piattaforma Studenti ITS
          </div>

          <h1 className="auth-gate-title">
            Il tuo hub di studio <br className="mobile-hide" />
            <span className="gradient-text">intelligente e sincronizzato</span>
          </h1>

          <p className="auth-gate-subtitle">
            Tutti i tuoi appunti a schede, le dispense PDF e l'assistente AI Gemini riuniti in un unico workspace. Accedi con il tuo account Google per visualizzare o scrivere note su qualsiasi dispositivo.
          </p>

          <button
            className="auth-gate-google-btn"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
          >
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{isLoggingIn ? 'Accesso in corso...' : 'Accedi con Google'}</span>
          </button>

          {/* Features Grid */}
          <div className="auth-gate-features">
            <div className="auth-gate-feature-card">
              <div className="feature-icon">📝</div>
              <div className="feature-title">Appunti a Schede Cloud</div>
              <div className="feature-desc">Scrivi e formatta le tue lezioni, con salvataggio istantaneo su Cloud Firestore.</div>
            </div>
            <div className="auth-gate-feature-card">
              <div className="feature-icon">📁</div>
              <div className="feature-title">Libreria Dispense & PDF</div>
              <div className="feature-desc">Carica file, slide e link Drive del corso con anteprima immediata a schermo intero.</div>
            </div>
            <div className="auth-gate-feature-card">
              <div className="feature-icon">🤖</div>
              <div className="feature-title">Gemini AI Copilot</div>
              <div className="feature-desc">Interroga l'AI sui tuoi appunti e sui tuoi PDF per chiarimenti, sintesi ed esercizi.</div>
            </div>
          </div>

          <div className="auth-gate-footer-note">
            🔒 Sincronizzazione protetta con Firebase Cloud • Accesso sicuro per studenti
          </div>
        </div>

        {/* Modal Backup in Auth Gate */}
        {isBackupModalOpen && (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <span className="modal-title">💾 Backup & Ripristino Workspace</span>
                <button className="modal-close" onClick={() => setIsBackupModalOpen(false)}>
                  ✕
                </button>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '4px 0 12px 0' }}>
                Se hai un file di backup precedente o desideri ripristinare i tuoi appunti, caricalo qui sotto:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className="dialog-btn primary"
                  style={{ width: '100%', padding: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => backupFileInputRef.current?.click()}
                >
                  📂 Seleziona File Backup (.json) da Ripristinare
                </button>
              </div>

              <div style={{ margin: '14px 0 8px 0', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  📋 Oppure incolla direttamente qui il testo del backup:
                </label>
                <textarea
                  placeholder="Incolla qui il contenuto JSON del backup..."
                  value={backupPasteText}
                  onChange={e => setBackupPasteText(e.target.value)}
                  style={{
                    width: '100%',
                    height: '80px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    padding: '8px',
                    resize: 'vertical'
                  }}
                />
                <button
                  className="dialog-btn"
                  disabled={!backupPasteText.trim()}
                  style={{ width: '100%', marginTop: '8px', padding: '8px', opacity: backupPasteText.trim() ? 1 : 0.5 }}
                  onClick={() => handleImportBackupData(backupPasteText)}
                >
                  ✨ Ripristina da Testo Incollato
                </button>
              </div>

              <button className="modal-save-btn" onClick={() => setIsBackupModalOpen(false)} style={{ marginTop: '12px' }}>
                Chiudi
              </button>
            </div>
          </div>
        )}

        <input
          type="file"
          ref={backupFileInputRef}
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleBackupFileSelect}
        />

        {/* Toasts container in Auth Gate */}
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

  // 3. Authenticated Workspace (When currentUser is present)
  return (
    <div className="app-viewport">
      {/* Unified App Top Header - NEVER overlaps content or chat toggle */}
      {!isImmersion && (
        <header className="app-topbar">
          <div className="topbar-left">
            <div className="topbar-brand">
              <span className="brand-dot"></span>
              <span className="brand-title">WORKSPACE ITS</span>
            </div>

            {/* Topbar Weather Quick Pill */}
            <button
              type="button"
              className="topbar-weather-btn"
              onClick={() => setIsWeatherModalOpen(true)}
              title="Meteo ITS • Clicca per visualizzare previsioni dettagliate, orarie e consigli"
            >
              <span className="weather-icon">{weatherData?.current.icon || '🌤️'}</span>
              <span className="weather-city">{selectedWeatherCity.name}</span>
              <span className="weather-temp">
                {weatherData ? `${weatherData.current.temp}°C` : '...'}
              </span>
              <span className="weather-cond">{weatherData?.current.conditionText || 'Meteo'}</span>
              <span className="weather-arrow">▾</span>
            </button>
          </div>

          <div className="topbar-right">
            {!isInstalled && (
              <button
                type="button"
                className="top-btn top-btn-install"
                onClick={handleInstallAppClick}
                title="Scarica Workspace ITS sul Desktop o schermata Home (scompare automaticamente una volta installata)"
              >
                💻 Scarica App
              </button>
            )}
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
              onClick={() => setIsBackupModalOpen(true)}
              title="Salva o Ripristina il backup dei tuoi appunti e corsi"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              💾 Backup
            </button>
            <button className="top-btn" id="immersion-btn" onClick={handleToggleImmersion} title="Attiva modalità concentrazione">
              Focus Mode
            </button>
            <button
              className="top-btn"
              onClick={() => setIsSettingsModalOpen(true)}
              title="Personalizza sfondi, font, meteo e chiavi API"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              ⚙️ Impostazioni
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
        </header>
      )}

      {/* Floating Exit Button ONLY when in Full Focus/Immersion mode */}
      {isImmersion && (
        <button
          className="immersion-exit-pill"
          onClick={handleToggleImmersion}
          title="Esci dalla modalità Focus"
        >
          ✕ Esci da Focus
        </button>
      )}

      {/* Main 3-Column Dashboard Container */}
      <div
        className={`dashboard-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${
          isChatCollapsed ? 'chat-collapsed' : ''
        }`}
        id="main-container"
      >
        {/* Left Column: Tools & Quick Launch */}
        <div className={`panel tools-column ${mobileTab === 'tools' ? 'mobile-active' : ''}`}>
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

          {/* Interactive Weather Widget in Tools Column */}
          {showWeatherWidget && (
            <div
              className="weather-card-widget"
              onClick={() => setIsWeatherModalOpen(true)}
              title="Clicca per aprire le previsioni meteo dettagliate e orarie"
            >
              <div className="weather-widget-top">
                <div className="weather-widget-city">
                  <span className="weather-icon-big">{weatherData?.current.icon || '🌤️'}</span>
                  <div>
                    <div className="weather-city-name">{selectedWeatherCity.name}</div>
                    <div className="weather-city-sub">{selectedWeatherCity.region}</div>
                  </div>
                </div>
                <div className="weather-widget-temp">
                  {weatherData ? `${weatherData.current.temp}°C` : '...'}
                </div>
              </div>
              <div className="weather-widget-bottom">
                <span className="weather-widget-desc">
                  {weatherData?.current.conditionText || 'Caricamento meteo...'}
                </span>
                <span className="weather-widget-link">Dettagli ↗</span>
              </div>
            </div>
          )}

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
        <div className={`panel ${isNotesMaximized ? 'notes-maximized' : ''} ${mobileTab === 'notes' || mobileTab === 'materials' ? 'mobile-active' : ''}`} id="notes-panel">
          
          {/* Top Unified Bar: Mode Switcher (Personal vs Shared) + View Switcher (Appunti vs Materiali) */}
          <div className="workspace-mode-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="workspace-mode-selector">
                <button
                  type="button"
                  className={`workspace-mode-btn ${workspaceMode === 'personal' ? 'active' : ''}`}
                  onClick={() => setWorkspaceMode('personal')}
                >
                  🔒 Personale
                </button>
                <button
                  type="button"
                  className={`workspace-mode-btn ${workspaceMode === 'shared' ? 'active' : ''}`}
                  onClick={() => {
                    setWorkspaceMode('shared');
                    if (userRooms.length === 0) {
                      setIsRoomModalOpen(true);
                    }
                  }}
                >
                  👥 Stanze di Gruppo
                  {userRooms.length > 0 && (
                    <span className="mode-badge">{userRooms.length}</span>
                  )}
                </button>
              </div>

              {/* Segmented Control Tabs merged inline to maximize vertical editor space */}
              <div className="tabs-container" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('notes')}
                >
                  📝 Appunti
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
                  onClick={() => setActiveTab('materials')}
                >
                  📚 Materiali ({activeDisplayMaterials.length})
                </button>
              </div>
            </div>

            {workspaceMode === 'shared' && (
              <div className="shared-actions-bar">
                <button
                  type="button"
                  className="room-btn primary"
                  onClick={() => {
                    setRoomModalTab('create');
                    setIsRoomModalOpen(true);
                  }}
                  title="Crea una nuova stanza di studio"
                >
                  + Nuova Stanza
                </button>
                <button
                  type="button"
                  className="room-btn"
                  onClick={() => {
                    setRoomModalTab('join');
                    setIsRoomModalOpen(true);
                  }}
                  title="Entra con codice invito (es. ITS-1234)"
                >
                  🔑 Entra con Codice
                </button>
              </div>
            )}
          </div>

          {/* Header depending on mode */}
          {workspaceMode === 'personal' ? (
            <>
              <div className="notes-header">
                <div className="notes-header-left">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
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
                    onClick={handleAddNewSubject}
                    title="Crea una nuova materia"
                  >
                    + Nuova Materia
                  </button>

                  <button
                    type="button"
                    className="header-btn"
                    onClick={() => handleDeleteSubject(activeSubject)}
                    title={subjects.length > 1 ? `Elimina la materia "${activeSubject}"` : "Non puoi eliminare l'unica materia presente (creane prima un'altra con '+ Nuova Materia')"}
                    style={{
                      color: '#f87171',
                      borderColor: 'rgba(239, 68, 68, 0.38)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      opacity: subjects.length > 1 ? 1 : 0.6
                    }}
                  >
                    🗑️ Elimina
                  </button>
                </div>
                <div className="notes-header-right">
                  <button className="header-btn" id="fullscreen-btn" onClick={handleToggleFullscreenNotes}>
                    {isNotesMaximized ? '🗗 Riduci' : '⛶ Massimizza Spazio'}
                  </button>
                </div>
              </div>

              {/* Compact Drive Bar */}
              <div className="drive-bar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 12H12l-5 9h10l5-9z" /><path d="M6 12L2 5h10l4 7-10 9z" />
                </svg>
                <input
                  type="url"
                  placeholder="Link cartella Google Drive del corso..."
                  value={driveLink}
                  onChange={handleDriveLinkChange}
                />
                <button className="drive-btn" onClick={handleOpenDrive}>
                  🔗 Apri Drive
                </button>
              </div>
            </>
          ) : (
            /* Shared Room Header */
            <div className="notes-header shared-room-header">
              <div className="notes-header-left" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>👥</span>
                {userRooms.length > 0 ? (
                  <>
                    <select
                      id="room-select"
                      value={activeRoomId}
                      onChange={e => setActiveRoomId(e.target.value)}
                      style={{ maxWidth: '200px' }}
                    >
                      {userRooms.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>

                    {activeRoom && (
                      <div
                        className="room-code-badge"
                        onClick={() => handleCopyRoomCode(activeRoom.code)}
                        title="Clicca per copiare il codice invito"
                      >
                        <span className="room-code-label">Codice:</span>
                        <span className="room-code-value">{activeRoom.code}</span>
                        <span className="room-code-copy-icon">📋</span>
                      </div>
                    )}

                    {activeRoomMemberList.length > 0 && (
                      <div className="room-members-cluster" title={`${activeRoomMemberList.length} partecipanti nella stanza`}>
                        {activeRoomMemberList.slice(0, 4).map(m => (
                          <div
                            key={m.uid}
                            className="member-avatar-pill"
                            title={m.displayName || m.email}
                          >
                            {m.photoURL ? (
                              <img src={m.photoURL} alt={m.displayName} />
                            ) : (
                              <span>{(m.displayName || 'S').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        <span className="members-count-tag">
                          {activeRoomMemberList.length} {activeRoomMemberList.length === 1 ? 'membro' : 'membri'}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Nessuna stanza attiva. Creane una o entra con un codice!
                  </span>
                )}
              </div>

              <div className="notes-header-right">
                {activeRoom && (
                  <button
                    className="header-btn"
                    onClick={handleLeaveRoom}
                    title="Esci da questa stanza di gruppo"
                    style={{
                      color: '#f87171',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      background: 'rgba(239, 68, 68, 0.1)'
                    }}
                  >
                    🚪 Esci
                  </button>
                )}
                {activeRoom && (activeRoom.createdBy === currentUser?.uid || isAdmin) && (
                  <button
                    className="header-btn"
                    onClick={handleDeleteRoom}
                    title="Elimina definitivamente questa stanza (solo Creatore/Host)"
                    style={{
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.6)',
                      background: 'rgba(239, 68, 68, 0.2)',
                      fontWeight: 700
                    }}
                  >
                    👑🗑️ Elimina Stanza
                  </button>
                )}
                <button className="header-btn" id="fullscreen-btn" onClick={handleToggleFullscreenNotes}>
                  {isNotesMaximized ? '🗗 Riduci' : '⛶ Massimizza'}
                </button>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="content-area">
            {workspaceMode === 'shared' && userRooms.length === 0 ? (
              <div className="empty-room-placeholder">
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>👥</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff' }}>Collaborazione in Tempo Reale</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '420px', lineHeight: 1.5, margin: '8px 0 20px 0' }}>
                  Crea una Stanza di Gruppo per lavorare insieme sui medesimi appunti con i tuoi compagni di classe, condividere file e porre domande all'AI visibili a tutti!
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    className="dialog-btn primary"
                    onClick={() => {
                      setRoomModalTab('create');
                      setIsRoomModalOpen(true);
                    }}
                  >
                    + Crea Nuova Stanza
                  </button>
                  <button
                    className="dialog-btn"
                    onClick={() => {
                      setRoomModalTab('join');
                      setIsRoomModalOpen(true);
                    }}
                  >
                    🔑 Entra con Codice
                  </button>
                </div>
              </div>
            ) : activeTab === 'notes' ? (
              <div id="notes-area-container">
                {/* VS Code Style Tabs Bar */}
                <div className="vscode-tabs-bar">
                  <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                    {workspaceMode === 'shared' ? (
                      activeRoomPages.map(page => (
                        <div
                          key={page.id}
                          className={`vscode-tab ${page.id === activeRoomPageId ? 'active' : ''}`}
                          onClick={() => setActiveRoomPageId(page.id)}
                          onContextMenu={e => {
                            e.preventDefault();
                            handleRenameRoomPage(page.id);
                          }}
                          title="Clicca per aprire, clic destro per rinominare (condiviso)"
                        >
                          <span>{page.name}</span>
                          <span
                            className="close-tab"
                            onClick={e => handleDeleteRoomPage(page.id, e)}
                            title="Elimina scheda"
                          >
                            ✕
                          </span>
                        </div>
                      ))
                    ) : (
                      currentSubPages.map(page => (
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
                      ))
                    )}
                  </div>
                  <button
                    className="add-tab-btn"
                    onClick={workspaceMode === 'shared' ? handleAddNewRoomPage : handleAddNewPage}
                    title={workspaceMode === 'shared' ? "Nuova Scheda di Gruppo" : "Nuova Pagina"}
                  >
                    +
                  </button>
                </div>

                {/* Rich Text Editor Toolbar - Complete Formatting & Zero Overflow */}
                <div className="editor-toolbar">
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('undo')}
                    title="Annulla (Ctrl+Z)"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('redo')}
                    title="Ripristina (Ctrl+Y)"
                  >
                    ↷
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
                    title="Formato paragrafo o titolo"
                  >
                    <option value="" disabled>
                      Formato
                    </option>
                    <option value="P">Paragrafo</option>
                    <option value="H1">Titolo 1 (H1)</option>
                    <option value="H2">Titolo 2 (H2)</option>
                    <option value="H3">Titolo 3 (H3)</option>
                    <option value="BLOCKQUOTE">Citazione</option>
                    <option value="PRE">Blocco Codice</option>
                  </select>

                  <span className="divider"></span>

                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('bold')}
                    title="Grassetto (Ctrl+B)"
                  >
                    <b>B</b>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('italic')}
                    title="Corsivo (Ctrl+I)"
                  >
                    <i>I</i>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('underline')}
                    title="Sottolineato (Ctrl+U)"
                  >
                    <u>U</u>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('strikeThrough')}
                    title="Barrato"
                  >
                    <s>S</s>
                  </button>

                  <span className="divider"></span>

                  {/* Highlighter Swatches */}
                  <div className="toolbar-swatch-group" title="Evidenziatore testo">
                    <span className="toolbar-swatch-label">🖍️</span>
                    {[
                      { color: '#fde047', label: 'Evidenzia Giallo' },
                      { color: '#6ee7b7', label: 'Evidenzia Verde' },
                      { color: '#7dd3fc', label: 'Evidenzia Azzurro' },
                      { color: '#f9a8d4', label: 'Evidenzia Rosa' },
                      { color: '#c4b5fd', label: 'Evidenzia Viola' }
                    ].map(sw => (
                      <button
                        key={sw.color}
                        type="button"
                        className="swatch-dot-btn"
                        style={{ backgroundColor: sw.color }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          handleFormatText('hiliteColor', sw.color);
                          handleFormatText('foreColor', '#09090b');
                        }}
                        title={sw.label}
                      />
                    ))}
                    <button
                      type="button"
                      className="swatch-clear-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        handleFormatText('hiliteColor', 'transparent');
                        handleFormatText('foreColor', '#ececf1');
                      }}
                      title="Rimuovi evidenziazione"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Text Color Swatches */}
                  <div className="toolbar-swatch-group" title="Colore del testo">
                    <span className="toolbar-swatch-label">A</span>
                    {[
                      { color: '#f8fafc', label: 'Testo Bianco' },
                      { color: '#818cf8', label: 'Testo Indaco' },
                      { color: '#38bdf8', label: 'Testo Ciano' },
                      { color: '#34d399', label: 'Testo Smeraldo' },
                      { color: '#fbbf24', label: 'Testo Ambra' },
                      { color: '#fb7185', label: 'Testo Corallo' }
                    ].map(sw => (
                      <button
                        key={sw.color}
                        type="button"
                        className="swatch-dot-btn"
                        style={{ backgroundColor: sw.color }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleFormatText('foreColor', sw.color)}
                        title={sw.label}
                      />
                    ))}
                  </div>

                  <span className="divider"></span>

                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('insertUnorderedList')}
                    title="Elenco puntato"
                  >
                    • Lista
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('insertOrderedList')}
                    title="Elenco numerato"
                  >
                    1. Num
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('justifyLeft')}
                    title="Allinea a sinistra"
                  >
                    ⬅
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('justifyCenter')}
                    title="Centra testo"
                  >
                    ⬌
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('insertHorizontalRule')}
                    title="Inserisci linea separatrice"
                  >
                    ―
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleFormatText('removeFormat')}
                    title="Pulisci formattazione sul testo selezionato"
                  >
                    🧹
                  </button>

                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="editor-action-btn drive-save"
                      onClick={handleSaveNoteToGoogleDrive}
                      disabled={isSavingToDrive}
                      title="Salva questa nota come documento nel tuo Google Drive personale"
                    >
                      {isSavingToDrive ? '⏳ Salvataggio...' : '☁️ Salva su Drive'}
                    </button>
                    <button
                      type="button"
                      className="editor-action-btn file-dl"
                      onClick={handleDownloadNoteFile}
                      title="Scarica questo appunto sul tuo computer (.html)"
                    >
                      💾 Scarica
                    </button>
                  </div>
                </div>

                {/* Contenteditable Notes Area */}
                <div
                  id="notes-area"
                  className={`font-${fontFamily}`}
                  style={{ fontSize: `${fontSize}px` }}
                  ref={el => {
                    (notesAreaRef as any).current = el;
                    if (el) {
                      const currentSubPages = pages[activeSubject] || [];
                      const currentPage = currentSubPages.find(p => p.id === activePageId) || currentSubPages[0];
                      const targetContent = workspaceMode === 'shared'
                        ? (activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0])?.content || ''
                        : (currentPage?.content || '');
                      if (el.innerHTML !== targetContent) {
                        el.innerHTML = targetContent;
                      }
                    }
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Inizia a scrivere i tuoi appunti... Seleziona il testo per evidenziarlo, cambiare colore o usare il menu rapido AI (clic destro)."
                  onInput={handleEditorInput}
                  onContextMenu={handleNotesContextMenu}
                />
              </div>
            ) : (
              <div id="materials-area">
                <div className="materials-header-bar">
                  <span className="materials-header-title">
                    {workspaceMode === 'shared'
                      ? `📁 Libreria Condivisa • ${activeRoom?.name || 'Stanza'}`
                      : `📁 Libreria File & PDF • ${activeSubject}`}
                  </span>
                  <div className="materials-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="add-material-btn" onClick={handleOpenAddMaterialModal}>
                      {workspaceMode === 'shared' ? '+ Condividi File / Link' : '+ Aggiungi File / Link'}
                    </button>
                  </div>
                </div>

                {Object.keys(activeGroupedMaterials).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0' }}>
                    {workspaceMode === 'shared'
                      ? 'Nessun file o PDF condiviso in questa stanza. Clicca su "+ Condividi File / Link" per caricare dispense, slide o documenti con il gruppo!'
                      : 'Nessuna risorsa salvata per questa materia. Clicca su "+ Aggiungi File / Link" per caricare dispense, PDF o link.'}
                  </div>
                ) : (
                  Object.entries(activeGroupedMaterials).map(([cat, items]) => (
                    <div key={cat} className="material-category">
                      <div className="material-category-title">
                        <span>{cat}</span>
                        <span style={{ opacity: 0.7, fontSize: '0.68rem' }}>{items.length} {items.length === 1 ? 'file' : 'file'}</span>
                      </div>
                      <div className="materials-grid">
                        {items.map(f => {
                          const meta = getFileMeta(f.name, f.url, f.fileType);
                          const displayName = formatMaterialDisplayName(f.name);
                          return (
                            <div key={f.id} className="material-card">
                              <div className="material-card-top">
                                <div className="material-info">
                                  <div
                                    className="material-icon-box"
                                    style={{ background: meta.color, border: `1px solid ${meta.border}` }}
                                  >
                                    {meta.icon}
                                  </div>
                                  <div className="material-text">
                                    <div className="material-name" title={f.name}>
                                      {displayName}
                                    </div>
                                    <div className="material-sub">
                                      <span className="material-type-pill">{meta.type}</span>
                                      {f.fileSize ? (
                                        <span>
                                          • {f.fileSize >= 1024 * 1024
                                            ? `${(f.fileSize / (1024 * 1024)).toFixed(1)} MB`
                                            : `${Math.max(1, Math.round(f.fileSize / 1024))} KB`}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <div className="material-top-tools">
                                  <button
                                    type="button"
                                    className="material-rename-btn"
                                    onClick={() => handleRenameMaterial(f)}
                                    title="Rinomina file o documento"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    className="material-del-btn"
                                    onClick={() => handleDeleteMaterial(f.id)}
                                    title="Rimuovi risorsa"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>

                              <div className="material-actions">
                                <button
                                  type="button"
                                  className="material-action-btn material-preview-btn"
                                  onClick={() => handleOpenPreview(f)}
                                  title="Visualizza anteprima documento o PDF"
                                >
                                  👁️ Anteprima
                                </button>
                                <button
                                  type="button"
                                  className="material-action-btn material-ai-btn"
                                  onClick={() => handleSelectMaterialForChat(f)}
                                  title="Chiedi spiegazioni a Gemini su questo materiale"
                                >
                                  🧠 Chiedi all'AI
                                </button>
                                <a
                                  href={f.url && f.url.startsWith('http') ? (extractGoogleDriveId(f.url) ? `https://drive.google.com/file/d/${extractGoogleDriveId(f.url)}/view` : f.url) : '#'}
                                  onClick={e => {
                                    if (!f.url || !f.url.startsWith('http')) {
                                      e.preventDefault();
                                      handleOpenPreview(f);
                                    }
                                  }}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="material-action-btn material-dl-btn"
                                  title="Apri o Scarica file"
                                >
                                  ↗ Apri
                                </a>
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
        <div className={`panel chat-column ${mobileTab === 'chat' ? 'mobile-active' : ''}`} id="chat-column">
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span className="chat-title">
                  {workspaceMode === 'shared' ? '👥 Chat di Gruppo' : 'Gemini Copilot'}
                </span>
                {workspaceMode === 'shared' && activeRoom && (
                  <span className="chat-room-badge" title={`Stanza: ${activeRoom.name}`}>
                    {activeRoom.name}
                  </span>
                )}
              </div>
              <div className="chat-controls-hide">
                {workspaceMode === 'personal' && (
                  <button className="expand-btn" onClick={handleClearChatHistory} title="Pulisci cronologia chat">
                    🧹 Pulisci
                  </button>
                )}
              </div>
            </div>

            <div className="chat-vertical-title">GEMINI AI</div>

            {/* Chat Messages */}
            <div className="chat-messages" ref={chatMessagesRef}>
              {workspaceMode === 'shared' ? (
                activeRoomMessages.length === 0 ? (
                  <div className="chat-msg ai">
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      👥 Chat Condivisa: {activeRoom?.name || 'Stanza di Gruppo'}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.9, lineHeight: 1.5 }}>
                      Qualsiasi studente nella stanza può porre domande a Gemini: sia la richiesta con il tuo nome che la risposta dell'AI appariranno qui dal vivo per tutti i compagni!
                    </p>
                  </div>
                ) : (
                  activeRoomMessages.map((msg) => {
                    const text = msg.parts?.[0]?.text || msg.rawText || '';
                    const isMe = msg.senderId === currentUser?.uid;

                    if (msg.role === 'model') {
                      return (
                        <div key={msg.id} className="chat-msg ai shared-ai-msg">
                          <div className="shared-msg-header">
                            <span className="ai-gemini-tag">✦ Gemini Copilot</span>
                            <span className="shared-msg-time">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
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
                        <div key={msg.id} className={`chat-msg user ${isMe ? 'my-msg' : 'other-member-msg'}`}>
                          <div className="shared-msg-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {msg.senderPhoto ? (
                                <img src={msg.senderPhoto} alt="" className="shared-avatar-small" />
                              ) : (
                                <span className="shared-avatar-initial">
                                  {(msg.senderName || 'S').charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className="shared-sender-name">
                                {isMe ? 'Tu' : msg.senderName || 'Studente'}
                              </span>
                            </div>
                            <span className="shared-msg-time">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div style={{ marginTop: '3px' }}>{text}</div>
                        </div>
                      );
                    }
                  })
                )
              ) : currentSubChats.length === 0 ? (
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
              activeDisplayMaterials.length > 0 && (
                <div className="chat-source-select-bar">
                  <select
                    value=""
                    onChange={e => {
                      const mat = activeDisplayMaterials.find(m => String(m.id) === e.target.value);
                      if (mat) {
                        handleSelectMaterialForChat(mat);
                      }
                    }}
                    className="chat-source-dropdown"
                  >
                    <option value="" disabled>
                      📎 Collega un file/PDF alla chat...
                    </option>
                    {activeDisplayMaterials.map(m => (
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

      {/* Mobile Bottom Navigation Bar (< 1024px) */}
      <nav className="mobile-bottom-nav" aria-label="Navigazione mobile">
        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'notes' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('notes');
            setActiveTab('notes');
          }}
        >
          <span className="mobile-nav-icon">📝</span>
          <span>Appunti</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'materials' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('materials');
            setActiveTab('materials');
          }}
        >
          <span className="mobile-nav-icon">📁</span>
          <span>Materiali</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileTab('chat')}
        >
          <span className="mobile-nav-icon">🤖</span>
          <span>AI Chat</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'tools' ? 'active' : ''}`}
          onClick={() => setMobileTab('tools')}
        >
          <span className="mobile-nav-icon">🛠️</span>
          <span>Strumenti</span>
        </button>
      </nav>

      {/* MODALE STANZE DI GRUPPO / COLLABORAZIONE */}
      {isRoomModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <span className="modal-title">👥 Stanze di Studio Condivise</span>
              <button className="modal-close" onClick={() => setIsRoomModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="tabs-container" style={{ margin: '8px 0 16px 0' }}>
              <button
                type="button"
                className={`tab-btn ${roomModalTab === 'create' ? 'active' : ''}`}
                onClick={() => setRoomModalTab('create')}
              >
                ✨ Crea Nuova Stanza
              </button>
              <button
                type="button"
                className={`tab-btn ${roomModalTab === 'join' ? 'active' : ''}`}
                onClick={() => setRoomModalTab('join')}
              >
                🔑 Entra con Codice
              </button>
            </div>

            {roomModalTab === 'create' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Crea uno spazio condiviso con un codice invito univoco a 6 caratteri (es. <code>ITS-4892</code>). I tuoi compagni potranno unirsi all'istante per scrivere insieme e chattare con l'AI.
                </p>
                <div className="dialog-field">
                  <label>Nome della Stanza / Gruppo:</label>
                  <input
                    type="text"
                    placeholder="Es. Progetto Cloud, Esercitazione Java..."
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateRoom();
                    }}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  className="dialog-btn primary"
                  disabled={roomActionLoading || !newRoomName.trim()}
                  onClick={handleCreateRoom}
                  style={{ marginTop: '8px', padding: '10px' }}
                >
                  {roomActionLoading ? 'Creazione in corso...' : 'Crea Stanza & Genera Codice'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Inserisci il codice fornito dal tuo compagno di classe per accedere alla stanza e partecipare alla sessione di studio comune:
                </p>
                <div className="dialog-field">
                  <label>Codice Stanza:</label>
                  <input
                    type="text"
                    placeholder="Es. ITS-8492"
                    value={joinRoomCode}
                    onChange={e => setJoinRoomCode(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleJoinRoom();
                    }}
                    style={{ textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  className="dialog-btn primary"
                  disabled={roomActionLoading || !joinRoomCode.trim()}
                  onClick={handleJoinRoom}
                  style={{ marginTop: '8px', padding: '10px' }}
                >
                  {roomActionLoading ? 'Accesso in corso...' : 'Partecipa alla Stanza'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                onClick={() => {
                  setIsSyncModalOpen(false);
                  setIsBackupModalOpen(true);
                }}
              >
                📂 Gestione Backup (Importa / Esporta)
              </button>
            </div>

            <button className="modal-save-btn" onClick={() => setIsSyncModalOpen(false)}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* MODALE BACKUP & RIPRISTINO COMPLETO */}
      {isBackupModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <span className="modal-title">💾 Backup & Ripristino Workspace</span>
              <button className="modal-close" onClick={() => setIsBackupModalOpen(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '4px 0 12px 0' }}>
              Salva una copia completa dei tuoi appunti, materie, materiali e conversazioni, oppure ripristina un backup fatto su un altro PC.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="dialog-btn primary"
                style={{ width: '100%', padding: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => backupFileInputRef.current?.click()}
              >
                📂 Seleziona File Backup (.json) da Ripristinare
              </button>

              <button
                className="dialog-btn"
                style={{ width: '100%', padding: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={handleExportBackup}
              >
                📥 Scarica Backup Completo di questo PC (.json)
              </button>
            </div>

            <div style={{ margin: '14px 0 8px 0', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                📋 Oppure incolla direttamente qui il testo o codice del backup:
              </label>
              <textarea
                placeholder="Incolla qui il contenuto JSON del backup..."
                value={backupPasteText}
                onChange={e => setBackupPasteText(e.target.value)}
                style={{
                  width: '100%',
                  height: '80px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  padding: '8px',
                  resize: 'vertical'
                }}
              />
              <button
                className="dialog-btn"
                disabled={!backupPasteText.trim()}
                style={{ width: '100%', marginTop: '8px', padding: '8px', opacity: backupPasteText.trim() ? 1 : 0.5 }}
                onClick={() => handleImportBackupData(backupPasteText)}
              >
                ✨ Ripristina da Testo Incollato
              </button>
            </div>

            <button className="modal-save-btn" onClick={() => setIsBackupModalOpen(false)} style={{ marginTop: '12px' }}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Hidden File Input for Backup Restoration */}
      <input
        type="file"
        ref={backupFileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleBackupFileSelect}
      />

      {/* MODALE AMMINISTRATORE GESTIONE ACCESSI */}
      {isAdminModalOpen && (() => {
        const pendingRequests = accessRequests.filter(r => {
          const reqEmail = (r.email || '').toLowerCase().trim();
          const reqUid = r.userId || r.id;
          const isCurrentlyActive = approvedUsers.some(u => {
            const uEmail = (u.email || '').toLowerCase().trim();
            const uUid = u.userId || u.id;
            return (uUid === reqUid || (Boolean(reqEmail) && Boolean(uEmail) && reqEmail === uEmail)) && u.status === 'active';
          });
          return !isCurrentlyActive;
        });

        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '580px' }}>
              <div className="modal-header">
                <span className="modal-title">👑 Gestione Accessi & Approvazioni</span>
                <button className="modal-close" onClick={() => setIsAdminModalOpen(false)}>
                  ✕
                </button>
              </div>
              
              {/* Direct Email Fast Authorization */}
              <div style={{ display: 'flex', gap: '8px', padding: '6px 0 12px 0', borderBottom: '1px solid var(--panel-border)' }}>
                <input
                  type="email"
                  placeholder="Autorizza direttamente (es. fabio.beccalli@itsrizzoli.it)..."
                  value={manualApprovalEmail}
                  onChange={e => setManualApprovalEmail(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && manualApprovalEmail.trim() && currentUser?.email) {
                      await WorkspaceService.manualApproveEmail(manualApprovalEmail.trim(), currentUser.email);
                      showToast(`Utente ${manualApprovalEmail.trim()} autorizzato con successo!`);
                      setManualApprovalEmail('');
                    }
                  }}
                />
                <button
                  className="dialog-btn primary"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', padding: '8px 14px' }}
                  disabled={!manualApprovalEmail.trim()}
                  onClick={async () => {
                    if (currentUser?.email && manualApprovalEmail.trim()) {
                      await WorkspaceService.manualApproveEmail(manualApprovalEmail.trim(), currentUser.email);
                      showToast(`Utente ${manualApprovalEmail.trim()} autorizzato con successo!`);
                      setManualApprovalEmail('');
                    }
                  }}
                >
                  ➕ Autorizza Email
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginTop: '10px' }}>
                <button
                  className={`tab-btn ${adminTab === 'requests' ? 'active' : ''}`}
                  onClick={() => setAdminTab('requests')}
                >
                  Richieste in attesa ({pendingRequests.length})
                </button>
                <button
                  className={`tab-btn ${adminTab === 'approved' ? 'active' : ''}`}
                  onClick={() => setAdminTab('approved')}
                >
                  Utenti autorizzati ({approvedUsers.filter(u => u.status === 'active').length})
                </button>
              </div>

              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginTop: '8px' }}>
                {adminTab === 'requests' ? (
                  pendingRequests.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                      Nessuna richiesta di accesso in sospeso.
                    </div>
                  ) : (
                    pendingRequests.map((req) => (
                      <div key={req.userId || req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
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
                              await WorkspaceService.removeApprovedUser(req);
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
                    <div key={u.id || u.userId || u.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
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
                              await WorkspaceService.revokeApprovedUser(u);
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
                            await WorkspaceService.removeApprovedUser(u);
                            showToast(`Utente ${u.email} rimosso definitivamente.`);
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
        );
      })()}

      {/* OVERLAY ACCESSO IN ATTESA DI APPROVAZIONE PER UTENTI NON ADMIN */}
      {currentUser && !isApproved && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '460px', padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Accesso in attesa di autorizzazione</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '12px 0 20px 0' }}>
              Ciao <b>{currentUser.displayName || currentUser.email}</b>!<br/>
              Questo workspace privato appartiene a <b>beccalli.fabio4@gmail.com</b>.
            </p>

            <div style={{ margin: '8px 0 14px 0', padding: '10px 12px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div className="sync-dot" style={{ background: '#38bdf8' }}></div>
              <span style={{ fontSize: '0.78rem', color: '#7dd3fc', fontWeight: 500 }}>
                Controllo autorizzazione attivo in tempo reale • Sblocco automatico
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="dialog-btn"
                style={{ background: 'rgba(59, 130, 246, 0.18)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#93c5fd', padding: '10px 14px', fontWeight: 600 }}
                onClick={handleImmediateSwitchAccount}
              >
                👤 Accedi con l'account principale (beccalli.fabio4@gmail.com)
              </button>

              <button
                className="dialog-btn"
                style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                onClick={async () => {
                  if (currentUser) {
                    await WorkspaceService.submitAccessRequest(currentUser);
                    showToast('Richiesta di accesso inviata al pannello Admin!');
                  }
                }}
              >
                📩 Reinvia notifica di richiesta ad admin
              </button>

              <button
                className="dialog-btn danger"
                style={{ padding: '8px 12px' }}
                onClick={handleImmediateLogoutFromWaitScreen}
              >
                🚪 Disconnetti account
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
        <div className="modal-overlay" onClick={() => setIsPreviewModalOpen(false)}>
          <div className="preview-modal-dialog" onClick={e => e.stopPropagation()}>
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
                    href={previewDriveId ? `https://drive.google.com/file/d/${previewDriveId}/view` : previewUrl}
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

            {/* Google Drive 403 / Access helper banner */}
            {previewDriveId && (
              <div className="preview-drive-alert">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <span>⚠️</span>
                  <span>
                    <b>Google Drive:</b> Se appare l'errore <i>"403 Non disponi dell'autorizzazione"</i>, significa che il file è privato o non autorizzato nell'anteprima integrata. Puoi aprirlo direttamente nel tuo Google account:
                  </span>
                </div>
                <a
                  href={`https://drive.google.com/file/d/${previewDriveId}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="preview-drive-direct-btn"
                >
                  Apri su Google Drive ↗
                </a>
              </div>
            )}

            <div className="preview-modal-body">
              {previewUrl ? (
                previewMaterial.fileType === 'image' || previewMaterial.mimeType?.includes('image') ? (
                  <img
                    src={previewUrl}
                    alt={previewMaterial.name}
                    style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="preview-modal-iframe"
                    title={`Anteprima ${previewMaterial.name}`}
                  >
                    <iframe
                      src={previewUrl}
                      className="preview-modal-iframe"
                      title={`Anteprima ${previewMaterial.name}`}
                    />
                  </object>
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

      {/* MODALE METEO DETTAGLIATO & PREVISIONI ITS */}
      <WeatherModal
        isOpen={isWeatherModalOpen}
        onClose={() => setIsWeatherModalOpen(false)}
        weatherData={weatherData}
        selectedCity={selectedWeatherCity}
        onSelectCity={city => setSelectedWeatherCity(city)}
        onRefresh={async () => {
          setIsWeatherLoading(true);
          const data = await fetchFullWeather(selectedWeatherCity);
          if (data) setWeatherData(data);
          setIsWeatherLoading(false);
          showToast('Meteo aggiornato!');
        }}
        onDetectLocation={handleDetectLocation}
        isLoading={isWeatherLoading}
      />

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

      {/* MODALE IMPOSTAZIONI DETTAGLIATE */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        bgIndex={bgIndex}
        onSelectBackground={handleSelectBgIndex}
        fontFamily={fontFamily}
        onSelectFontFamily={handleSelectFontFamily}
        fontSize={fontSize}
        onSelectFontSize={handleSelectFontSize}
        showWeatherWidget={showWeatherWidget}
        onToggleShowWeatherWidget={handleToggleWeatherWidget}
        isImmersion={isImmersion}
        onToggleImmersion={handleToggleImmersion}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapsed={handleToggleSidebar}
        selectedWeatherCity={selectedWeatherCity}
        onSelectCity={setSelectedWeatherCity}
        presetCities={PRESET_CITIES}
        apiKeys={apiKeys}
        selectedKeyIndex={selectedKeyIndex}
        onSaveApiKeys={(keys, idx) => {
          setApiKeys(keys);
          setSelectedKeyIndex(idx);
          WorkspaceService.saveLocalApiKeys(keys, idx);
          if (currentUser) {
            WorkspaceService.saveApiKeysToCloud(currentUser.uid, keys, idx);
          }
        }}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        currentUser={currentUser}
        cloudSyncActive={cloudSyncActive}
        onExportBackup={handleExportBackup}
        onOpenRestoreBackup={() => {
          setIsSettingsModalOpen(false);
          setIsBackupModalOpen(true);
        }}
        showToast={showToast}
      />

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
