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
  SharedChatMessage,
  CustomWidget,
  ColumnLayoutPreset,
  ShortcutActionId,
  ImageLayoutMode,
  DrawingToolType
} from './types';
import { WorkspaceService, DEFAULT_SUBJECTS, DEFAULT_PAGES } from './services/workspaceService';
import { saveFileToIndexedDB, getFileFromIndexedDB, deleteFileFromIndexedDB } from './services/fileStorage';
import { WeatherModal } from './components/WeatherModal';
import { SettingsModal, BACKGROUND_THEMES, ACCENT_THEMES, PANEL_THEMES } from './components/SettingsModal';
import { WorkspaceWidgetsDock } from './components/WorkspaceWidgetsDock';
import {
  APP_VERSION,
  CODE_LANGUAGES,
  FORMULA_SYMBOLS,
  FORMULA_PRESETS,
  DEFAULT_SHORTCUTS,
  matchesShortcutCombo,
  DEFAULT_TEXT_COLORS,
  DEFAULT_HIGHLIGHT_COLORS,
  DEFAULT_PEN_COLORS,
  addColorToPalette,
  removeColorFromPalette,
  hexToHighlightRgba,
  buildInteractiveTableHtml,
  sanitizeAndUpgradeNoteHtml,
  buildSvgElementString,
  evaluateMathExpression,
  highlightCodeSyntax,
  buildHighlightedCodeBlockHtml,
  buildInteractiveFormulaBoxHtml,
  computeCodeKeyDownEdit,
  getSelectionCharOffsetsWithin,
  setCaretCharOffsetWithin,
  computeContextMenuPosition,
  compressImageFromBlob
} from './utils/editorTools';
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
  const [toolbarPxSize, setToolbarPxSize] = useState<number>(15);
  const [showWeatherWidget, setShowWeatherWidget] = useState<boolean>(true);
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [accentColor, setAccentColor] = useState<string>('indigo');
  const [panelTheme, setPanelTheme] = useState<string>('default');
  const [panelOpacity, setPanelOpacity] = useState<number>(82);
  const [showDriveBar, setShowDriveBar] = useState<boolean>(true);
  const [columnLayout, setColumnLayout] = useState<ColumnLayoutPreset>('tools-notes-chat');
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>(256);
  const [rightColumnWidth, setRightColumnWidth] = useState<number>(336);
  const [widgetColumnWidth, setWidgetColumnWidth] = useState<number>(420);
  const [chatSplitRatio, setChatSplitRatio] = useState<number>(52);
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [customShortcuts, setCustomShortcuts] = useState<Record<ShortcutActionId, string>>(() => ({
    ...(DEFAULT_SHORTCUTS as Record<ShortcutActionId, string>)
  }));
  const [savedTextColors, setSavedTextColors] = useState<string[]>(DEFAULT_TEXT_COLORS);
  const [savedHighlightColors, setSavedHighlightColors] = useState<string[]>(DEFAULT_HIGHLIGHT_COLORS);
  const [savedPenColors, setSavedPenColors] = useState<string[]>(DEFAULT_PEN_COLORS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'appearance' | 'theme_bars' | 'widgets' | 'shortcuts' | 'keys' | 'account' | undefined
  >(undefined);
  const lastEditorRangeRef = useRef<Range | null>(null);

  // Freehand Drawing Pen Tool State in Notes
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [drawingTool, setDrawingTool] = useState<DrawingToolType>('pen');
  const [drawingColor, setDrawingColor] = useState<string>('#38bdf8');
  const [drawingWidth, setDrawingWidth] = useState<number>(3);
  const activeDrawPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const isPointerDrawingRef = useRef<boolean>(false);
  const tempDrawElementRef = useRef<SVGElement | null>(null);

  // Selected Movable / Anchored Image State in Notes
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null);
  const [selectedImageMeta, setSelectedImageMeta] = useState<{
    layout: ImageLayoutMode;
    pinned: boolean;
    widthPct: number;
  }>({
    layout: 'inline',
    pinned: false,
    widthPct: 60
  });
  const draggingImageRef = useRef<{
    img: HTMLImageElement;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  // Active Interactive Table Cell State in Notes
  const [activeTableCell, setActiveTableCell] = useState<HTMLTableCellElement | null>(null);

  // Notes Find & Replace (Ctrl+F), Code Block Modal & Formula Modal State
  const [isFindBarOpen, setIsFindBarOpen] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [findMatchCount, setFindMatchCount] = useState<number>(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  const [isCodeModalOpen, setIsCodeModalOpen] = useState<boolean>(false);
  const [codeModalLang, setCodeModalLang] = useState<string>('javascript');
  const [codeModalText, setCodeModalText] = useState<string>('');

  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState<boolean>(false);
  const [formulaInput, setFormulaInput] = useState<string>('');

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
    clickX: number;
    clickY: number;
    selectedText: string;
    savedRange: Range | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    clickX: 0,
    clickY: 0,
    selectedText: '',
    savedRange: null
  });

  // Refs
  const notesAreaRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
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
    setIsImmersion(false);
    setIsSidebarCollapsed(localPref.isSidebarCollapsed);
    setIsChatCollapsed(localPref.isChatCollapsed);
    setSelectedModel(localPref.selectedModel);
    if (localPref.fontFamily) setFontFamily(localPref.fontFamily);
    if (localPref.fontSize) {
      setFontSize(localPref.fontSize);
      setToolbarPxSize(localPref.fontSize);
    }
    if (typeof localPref.showWeatherWidget === 'boolean') {
      setShowWeatherWidget(localPref.showWeatherWidget);
    }
    if (typeof localPref.compactMode === 'boolean') {
      setCompactMode(localPref.compactMode);
    }
    if (localPref.accentColor) {
      setAccentColor(localPref.accentColor);
    }
    if (localPref.panelTheme) {
      setPanelTheme(localPref.panelTheme);
    }
    if (typeof localPref.panelOpacity === 'number') {
      setPanelOpacity(localPref.panelOpacity);
    }
    if (typeof localPref.showDriveBar === 'boolean') {
      setShowDriveBar(localPref.showDriveBar);
    }
    if (localPref.columnLayout) {
      setColumnLayout(localPref.columnLayout);
    }
    if (typeof localPref.leftColumnWidth === 'number') {
      setLeftColumnWidth(localPref.leftColumnWidth);
    }
    if (typeof localPref.rightColumnWidth === 'number') {
      setRightColumnWidth(localPref.rightColumnWidth);
    }
    if (typeof localPref.widgetColumnWidth === 'number') {
      setWidgetColumnWidth(localPref.widgetColumnWidth);
    }
    if (typeof localPref.chatSplitRatio === 'number') {
      setChatSplitRatio(localPref.chatSplitRatio);
    }
    if (Array.isArray(localPref.customWidgets)) {
      setCustomWidgets(localPref.customWidgets);
    }
    if (localPref.customShortcuts) {
      setCustomShortcuts({
        ...(DEFAULT_SHORTCUTS as Record<ShortcutActionId, string>),
        ...localPref.customShortcuts
      });
    }
    if (Array.isArray(localPref.savedTextColors)) {
      setSavedTextColors(localPref.savedTextColors);
    }
    if (Array.isArray(localPref.savedHighlightColors)) {
      setSavedHighlightColors(localPref.savedHighlightColors);
    }
    if (Array.isArray(localPref.savedPenColors)) {
      setSavedPenColors(localPref.savedPenColors);
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

  // Apply Background (Monocolor or Photographic) and Compact Mode
  useEffect(() => {
    const selectedBg = BACKGROUND_THEMES.find(t => t.id === bgIndex) || BACKGROUND_THEMES[0];
    if (compactMode) {
      document.body.classList.add('compact-mode');
      document.body.style.backgroundImage = 'none';
      if (selectedBg?.solidColor) {
        document.documentElement.style.setProperty('--bg-base', selectedBg.solidColor);
      }
    } else {
      document.body.classList.remove('compact-mode');
      document.body.style.backgroundImage = selectedBg?.cssUrl || BACKGROUNDS[0];
      if (selectedBg?.solidColor) {
        document.documentElement.style.setProperty('--bg-base', selectedBg.solidColor);
      } else {
        document.documentElement.style.setProperty('--bg-base', '#070709');
      }
    }
  }, [bgIndex, compactMode]);

  // Apply Accent Color, Panel/Sidebar/Topbar Theme & Column Dimension CSS Variables
  useEffect(() => {
    const root = document.documentElement;
    const presetAccent = ACCENT_THEMES.find(a => a.id === accentColor);
    if (presetAccent) {
      root.style.setProperty('--accent-primary', presetAccent.primary);
      root.style.setProperty('--accent-secondary', presetAccent.secondary);
      root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${presetAccent.primary} 0%, ${presetAccent.secondary} 100%)`);
      root.style.setProperty('--accent-surface', presetAccent.surface);
      root.style.setProperty('--accent-border', presetAccent.border);
    } else if (accentColor && accentColor.startsWith('#')) {
      root.style.setProperty('--accent-primary', accentColor);
      root.style.setProperty('--accent-secondary', accentColor);
      root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${accentColor} 0%, #38bdf8 100%)`);
      root.style.setProperty('--accent-surface', hexToHighlightRgba(accentColor, 0.2));
      root.style.setProperty('--accent-border', hexToHighlightRgba(accentColor, 0.45));
    }

    const panelObj = PANEL_THEMES.find(p => p.id === panelTheme) || PANEL_THEMES[0];
    const alpha = Math.max(0.55, Math.min(1, panelOpacity / 100));
    const topbarAlpha = Math.max(0.75, Math.min(1, (panelOpacity + 8) / 100));
    root.style.setProperty('--panel-bg', `rgba(${panelObj.rgb}, ${alpha})`);
    root.style.setProperty('--topbar-bg', `rgba(${panelObj.topbarRgb}, ${topbarAlpha})`);

    root.style.setProperty('--user-left-w', `${leftColumnWidth}px`);
    root.style.setProperty('--user-right-w', `${rightColumnWidth}px`);
    root.style.setProperty('--user-widget-col-w', `${widgetColumnWidth}px`);
    root.style.setProperty('--chat-split-pct', `${chatSplitRatio}%`);
  }, [accentColor, panelTheme, panelOpacity, leftColumnWidth, rightColumnWidth, widgetColumnWidth, chatSplitRatio]);

  // Firebase Auth State Listener & Cloud Sync Setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      // 1. Immediately clean up previous user's listeners to prevent permission-denied errors on teardown
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }

      if (!user) {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1') {
          setCurrentUser({
            uid: 'local-preview-uid',
            email: 'beccalli.fabio4@gmail.com',
            displayName: 'Fabio Beccalli',
            photoURL: null
          } as unknown as User);
          setIsAdmin(true);
          setIsApproved(true);
          setCloudSyncActive(false);
          setAuthLoading(false);
          return;
        }
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
            if (pref.isSidebarCollapsed !== undefined) setIsSidebarCollapsed(pref.isSidebarCollapsed);
            if (pref.isChatCollapsed !== undefined) setIsChatCollapsed(pref.isChatCollapsed);
            if (pref.selectedModel !== undefined) setSelectedModel(pref.selectedModel);
            if (pref.fontFamily !== undefined) setFontFamily(pref.fontFamily);
            if (pref.fontSize !== undefined) {
              setFontSize(pref.fontSize);
              setToolbarPxSize(pref.fontSize);
            }
            if (pref.showWeatherWidget !== undefined) setShowWeatherWidget(pref.showWeatherWidget);
            if (pref.compactMode !== undefined) setCompactMode(pref.compactMode);
            if (pref.accentColor !== undefined) setAccentColor(pref.accentColor);
            if (pref.panelTheme !== undefined) setPanelTheme(pref.panelTheme);
            if (pref.panelOpacity !== undefined) setPanelOpacity(pref.panelOpacity);
            if (pref.showDriveBar !== undefined) setShowDriveBar(pref.showDriveBar);
            if (pref.columnLayout !== undefined) setColumnLayout(pref.columnLayout);
            if (pref.leftColumnWidth !== undefined) setLeftColumnWidth(pref.leftColumnWidth);
            if (pref.rightColumnWidth !== undefined) setRightColumnWidth(pref.rightColumnWidth);
            if (pref.widgetColumnWidth !== undefined) setWidgetColumnWidth(pref.widgetColumnWidth);
            if (pref.chatSplitRatio !== undefined) setChatSplitRatio(pref.chatSplitRatio);
            if (pref.customWidgets !== undefined) setCustomWidgets(pref.customWidgets);
            if (pref.customShortcuts !== undefined) {
              setCustomShortcuts({
                ...(DEFAULT_SHORTCUTS as Record<ShortcutActionId, string>),
                ...pref.customShortcuts
              });
            }
            if (pref.savedTextColors !== undefined) setSavedTextColors(pref.savedTextColors);
            if (pref.savedHighlightColors !== undefined) setSavedHighlightColors(pref.savedHighlightColors);
            if (pref.savedPenColors !== undefined) setSavedPenColors(pref.savedPenColors);
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
      const rawContent = currentRoomPage ? currentRoomPage.content : '';
      const targetContent = sanitizeAndUpgradeNoteHtml(rawContent).cleanedHtml;
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
    const rawContent = currentPage ? currentPage.content : '';
    const targetContent = sanitizeAndUpgradeNoteHtml(rawContent).cleanedHtml;
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
    const clamped = Math.max(8, Math.min(96, size));
    setFontSize(clamped);
    setToolbarPxSize(clamped);
    WorkspaceService.saveLocalPreferences({ fontSize: clamped });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { fontSize: clamped });
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

  // Compact / No-Wallpaper mode toggle
  const handleToggleCompactMode = (compact: boolean) => {
    setCompactMode(compact);
    WorkspaceService.saveLocalPreferences({ compactMode: compact });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { compactMode: compact });
    }
  };

  // Accent color handler
  const handleSelectAccentColor = (accent: string) => {
    setAccentColor(accent);
    WorkspaceService.saveLocalPreferences({ accentColor: accent });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { accentColor: accent });
    }
  };

  // Panel / Topbar / Sidebar theme color handler
  const handleSelectPanelTheme = (theme: string) => {
    setPanelTheme(theme);
    WorkspaceService.saveLocalPreferences({ panelTheme: theme });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { panelTheme: theme });
    }
  };

  // Panel opacity handler
  const handleChangePanelOpacity = (opacity: number) => {
    setPanelOpacity(opacity);
    WorkspaceService.saveLocalPreferences({ panelOpacity: opacity });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { panelOpacity: opacity });
    }
  };

  // Show/Hide Google Drive link bar
  const handleToggleShowDriveBar = (show: boolean) => {
    setShowDriveBar(show);
    WorkspaceService.saveLocalPreferences({ showDriveBar: show });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { showDriveBar: show });
    }
  };

  // Column layout order & width handlers
  const handleChangeColumnLayout = (layout: ColumnLayoutPreset) => {
    setColumnLayout(layout);
    WorkspaceService.saveLocalPreferences({ columnLayout: layout });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { columnLayout: layout });
    }
  };

  const handleChangeLeftColumnWidth = (width: number) => {
    const clamped = Math.max(180, Math.min(380, width));
    setLeftColumnWidth(clamped);
    WorkspaceService.saveLocalPreferences({ leftColumnWidth: clamped });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { leftColumnWidth: clamped });
    }
  };

  const handleChangeRightColumnWidth = (width: number) => {
    const clamped = Math.max(260, Math.min(560, width));
    setRightColumnWidth(clamped);
    WorkspaceService.saveLocalPreferences({ rightColumnWidth: clamped });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { rightColumnWidth: clamped });
    }
  };

  const handleChangeWidgetColumnWidth = (width: number) => {
    const clamped = Math.max(280, Math.min(720, width));
    setWidgetColumnWidth(clamped);
    WorkspaceService.saveLocalPreferences({ widgetColumnWidth: clamped });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { widgetColumnWidth: clamped });
    }
  };

  const handleChangeChatSplitRatio = (ratio: number) => {
    const clamped = Math.max(30, Math.min(75, ratio));
    setChatSplitRatio(clamped);
    WorkspaceService.saveLocalPreferences({ chatSplitRatio: clamped });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { chatSplitRatio: clamped });
    }
  };

  const handleUpdateCustomWidgets = (widgets: CustomWidget[]) => {
    setCustomWidgets(widgets);
    WorkspaceService.saveLocalPreferences({ customWidgets: widgets });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { customWidgets: widgets });
    }
  };

  const handleUpdateSingleWidget = (updated: CustomWidget) => {
    const nextList = customWidgets.map(w => (w.id === updated.id ? updated : w));
    handleUpdateCustomWidgets(nextList);
  };

  const handleRemoveSingleWidget = (widgetId: string) => {
    const nextList = customWidgets.filter(w => w.id !== widgetId);
    handleUpdateCustomWidgets(nextList);
    showToast('Widget rimosso.');
  };

  // Programmable Keyboard Shortcuts & Saved Color Palettes Persistence
  const handleUpdateCustomShortcuts = (shortcuts: Record<ShortcutActionId, string>) => {
    setCustomShortcuts(shortcuts);
    WorkspaceService.saveLocalPreferences({ customShortcuts: shortcuts });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { customShortcuts: shortcuts });
    }
  };

  const handleUpdateSavedTextColors = (colors: string[]) => {
    setSavedTextColors(colors);
    WorkspaceService.saveLocalPreferences({ savedTextColors: colors });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { savedTextColors: colors });
    }
  };

  const handleUpdateSavedHighlightColors = (colors: string[]) => {
    setSavedHighlightColors(colors);
    WorkspaceService.saveLocalPreferences({ savedHighlightColors: colors });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { savedHighlightColors: colors });
    }
  };

  const handleUpdateSavedPenColors = (colors: string[]) => {
    setSavedPenColors(colors);
    WorkspaceService.saveLocalPreferences({ savedPenColors: colors });
    if (currentUser) {
      WorkspaceService.saveUserPreferencesToCloud(currentUser.uid, { savedPenColors: colors });
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

  // Record current selection in notes editor so toolbar pixel input can resize selected text
  const handleRecordEditorSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !notesAreaRef.current) return;
    const range = sel.getRangeAt(0);
    if (notesAreaRef.current.contains(range.commonAncestorContainer)) {
      lastEditorRangeRef.current = range.cloneRange();
      const parentEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      if (parentEl && notesAreaRef.current.contains(parentEl)) {
        const computedPx = parseInt(window.getComputedStyle(parentEl).fontSize, 10);
        if (!isNaN(computedPx) && computedPx >= 8 && computedPx <= 96) {
          setToolbarPxSize(computedPx);
        }
      }
    }
  };

  // Apply exact pixel (px) font size to selected text in notes, or to whole note if no text is selected
  const handleApplyPixelFontSize = (rawPx: number) => {
    const px = Math.max(8, Math.min(96, Math.round(rawPx)));
    setToolbarPxSize(px);

    if (!notesAreaRef.current) {
      handleSelectFontSize(px);
      return;
    }

    const sel = window.getSelection();
    let activeRange: Range | null = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && notesAreaRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      activeRange = sel.getRangeAt(0);
    } else if (lastEditorRangeRef.current && !lastEditorRangeRef.current.collapsed && notesAreaRef.current.contains(lastEditorRangeRef.current.commonAncestorContainer)) {
      activeRange = lastEditorRangeRef.current;
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(activeRange);
      }
    }

    if (activeRange && !activeRange.collapsed) {
      notesAreaRef.current.focus();
      try {
        document.execCommand('styleWithCSS', false, 'false');
      } catch {
        // Ignore
      }
      document.execCommand('fontSize', false, '7');
      const fontElements = notesAreaRef.current.querySelectorAll('font[size="7"]');
      let firstCreatedSpan: HTMLElement | null = null;
      let lastCreatedSpan: HTMLElement | null = null;
      fontElements.forEach(fontEl => {
        const span = document.createElement('span');
        span.style.fontSize = `${px}px`;
        span.innerHTML = fontEl.innerHTML;
        fontEl.parentNode?.replaceChild(span, fontEl);
        if (!firstCreatedSpan) firstCreatedSpan = span;
        lastCreatedSpan = span;
      });
      if (firstCreatedSpan && lastCreatedSpan && sel) {
        const newRange = document.createRange();
        newRange.setStartBefore(firstCreatedSpan);
        newRange.setEndAfter(lastCreatedSpan);
        sel.removeAllRanges();
        sel.addRange(newRange);
        lastEditorRangeRef.current = newRange.cloneRange();
      }
      handleEditorInput();
    } else {
      // No text selected: change default note pixel font size
      handleSelectFontSize(px);
    }
  };

  // Copy whole note plain text to clipboard
  const handleCopyWholeNote = () => {
    const text = notesAreaRef.current?.innerText?.trim() || '';
    if (!text) {
      showToast('L\'appunto è vuoto.', 'error');
      return;
    }
    navigator.clipboard.writeText(text);
    showToast('📋 Testo degli appunti copiato!');
  };

  // Rich Text Formatting helper (preserves selection & supports CSS colors/highlights)
  const handleFormatText = (command: string, value: string | undefined = undefined) => {
    if (notesAreaRef.current) {
      notesAreaRef.current.focus();
      if (lastEditorRangeRef.current && notesAreaRef.current.contains(lastEditorRangeRef.current.commonAncestorContainer)) {
        const sel = window.getSelection();
        if (sel && sel.isCollapsed && !lastEditorRangeRef.current.collapsed) {
          sel.removeAllRanges();
          sel.addRange(lastEditorRangeRef.current);
        }
      }
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

  // Helper to insert HTML snippet at the current/saved cursor position in #notes-area
  const insertHtmlAtEditorCursor = useCallback((html: string) => {
    const editor = notesAreaRef.current;
    if (!editor) return;
    editor.focus();

    const sel = window.getSelection();
    let range: Range | null = null;

    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    } else if (lastEditorRangeRef.current && editor.contains(lastEditorRangeRef.current.commonAncestorContainer)) {
      range = lastEditorRangeRef.current.cloneRange();
    }

    // If the cursor is currently inside an existing .note-code-block or .note-formula-box,
    // step right after that widget so we never nest widgets inside each other
    if (range) {
      const containerNode = range.commonAncestorContainer;
      const containerEl =
        containerNode.nodeType === Node.ELEMENT_NODE
          ? (containerNode as HTMLElement)
          : containerNode.parentElement;
      const enclosingWidget = containerEl?.closest('.note-code-block, .note-formula-box');
      if (enclosingWidget && editor.contains(enclosingWidget)) {
        const afterRange = document.createRange();
        afterRange.setStartAfter(enclosingWidget);
        afterRange.collapse(true);
        range = afterRange;
      }
    }

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const frag = document.createDocumentFragment();
    let lastInsertedNode: ChildNode | null = null;
    while (temp.firstChild) {
      lastInsertedNode = temp.firstChild;
      frag.appendChild(temp.firstChild);
    }

    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(frag);
      if (lastInsertedNode && sel) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastInsertedNode);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        lastEditorRangeRef.current = nextRange.cloneRange();
      }
    } else {
      editor.appendChild(frag);
    }

    handleEditorInput();
  }, [activeSubject, activePageId, workspaceMode, activeRoomId, activeRoomPageId]);

  // Restore Blockquote (💬 Citazione)
  const handleInsertBlockquote = () => {
    if (!notesAreaRef.current) return;
    notesAreaRef.current.focus();
    const sel = window.getSelection();
    const selectedText = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    const quoteHtml = `<blockquote class="note-blockquote">${
      selectedText || 'Scrivi qui la tua citazione o definizione importante...'
    }</blockquote><p><br></p>`;
    insertHtmlAtEditorCursor(quoteHtml);
    showToast('💬 Citazione inserita negli appunti!');
  };

  // Directly insert an interactive syntax-highlighted Code Block Box into #notes-area (no modal)
  const handleInsertDirectCodeBlock = (prefillText?: string, defaultLang = 'javascript') => {
    if (!notesAreaRef.current) return;
    const sel = window.getSelection();
    let selectedOutsideWidget = '';
    if (sel && !sel.isCollapsed && notesAreaRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const anc = sel.getRangeAt(0).commonAncestorContainer;
      const ancEl = anc.nodeType === Node.ELEMENT_NODE ? (anc as HTMLElement) : anc.parentElement;
      if (!ancEl?.closest('.note-code-block, .note-formula-box')) {
        selectedOutsideWidget = sel.toString();
      }
    }
    const currentSel =
      typeof prefillText === 'string' && prefillText.trim()
        ? prefillText
        : selectedOutsideWidget
        ? selectedOutsideWidget
        : 'for (let i = 0; i < 10; i++) {\n    console.log(i);\n}';

    const blockHtml = buildHighlightedCodeBlockHtml(currentSel, defaultLang);
    insertHtmlAtEditorCursor(blockHtml);

    setTimeout(() => {
      if (!notesAreaRef.current) return;
      const codeBlocks = notesAreaRef.current.querySelectorAll('.note-code-pre');
      const lastPre = codeBlocks[codeBlocks.length - 1] as HTMLElement | undefined;
      if (lastPre) {
        lastPre.focus();
        const codeEl = lastPre.querySelector('.note-code-content') as HTMLElement | null;
        if (codeEl) {
          const len = (codeEl.textContent || '').length;
          setCaretCharOffsetWithin(codeEl, len);
        }
      }
    }, 20);

    showToast('💻 Box codice inserito! Usa il menu a tendina per il linguaggio e Tab/Invio per indentare.');
  };

  // Keep modal handler for legacy fallback if needed
  const handleOpenCodeModal = (prefillText?: string) => {
    handleInsertDirectCodeBlock(prefillText);
  };

  // Insert Syntax-Highlighted Code Block into Notes
  const handleInsertSyntaxCodeBlock = () => {
    if (!codeModalText.trim()) {
      showToast('Inserisci o incolla il codice prima di confermare.', 'error');
      return;
    }
    const blockHtml = buildHighlightedCodeBlockHtml(codeModalText, codeModalLang);
    insertHtmlAtEditorCursor(blockHtml);
    setIsCodeModalOpen(false);
    setCodeModalText('');
    const langObj = CODE_LANGUAGES.find(l => l.id === codeModalLang);
    showToast(`💻 Blocco codice ${langObj?.label || codeModalLang} inserito!`);
  };

  // Directly insert an interactive live Formula Box into #notes-area (no modal)
  const handleInsertDirectFormulaBox = (overrideExpr?: string) => {
    if (!notesAreaRef.current) return;
    const sel = window.getSelection();
    let candidate = typeof overrideExpr === 'string' ? overrideExpr.trim() : '';

    if (!candidate && sel && !sel.isCollapsed && notesAreaRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const anc = sel.getRangeAt(0).commonAncestorContainer;
      const ancEl = anc.nodeType === Node.ELEMENT_NODE ? (anc as HTMLElement) : anc.parentElement;
      if (!ancEl?.closest('.note-code-block, .note-formula-box')) {
        candidate = sel.toString().trim();
        lastEditorRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    }

    const initialExpr = candidate || '25 * 4';
    const boxHtml = buildInteractiveFormulaBoxHtml(initialExpr);
    insertHtmlAtEditorCursor(boxHtml);

    setTimeout(() => {
      if (!notesAreaRef.current) return;
      const inputs = notesAreaRef.current.querySelectorAll('.note-formula-input');
      const lastInput = inputs[inputs.length - 1] as HTMLElement | undefined;
      if (lastInput) {
        lastInput.focus();
        const len = (lastInput.textContent || '').length;
        setCaretCharOffsetWithin(lastInput, len);
      }
    }, 20);

    showToast('∑ Box formula live inserita! Scrivi dentro la box per calcolare in tempo reale.');
  };

  const handleInlineCalculateInNotes = (overrideExpr?: string) => {
    handleInsertDirectFormulaBox(overrideExpr);
  };

  // Insert Formula / Calculation from Modal into Notes
  const handleInsertFormulaFromModal = (includeResult: boolean) => {
    const raw = formulaInput.trim();
    if (!raw) {
      showToast('Scrivi una formula o espressione matematica.', 'error');
      return;
    }
    const displayHtml = includeResult
      ? buildInteractiveFormulaBoxHtml(raw)
      : `<span class="note-formula-chip" contenteditable="false">${raw}</span>&nbsp;`;
    insertHtmlAtEditorCursor(displayHtml);
    setIsFormulaModalOpen(false);
    setFormulaInput('');
    showToast('∑ Formula inserita negli appunti!');
  };

  // Delegate click inside #notes-area (Copy code, delete code block, delete formula box, language dropdown focus)
  const handleNotesAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Allow interacting with the language <select> inside a code block without contenteditable stealing focus
    if (target.closest('.note-code-lang-select')) {
      e.stopPropagation();
      return;
    }

    // Copy code button
    const copyBtn = target.closest('.note-code-copy-btn') as HTMLElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const codeBlock = copyBtn.closest('.note-code-block');
      const codeEl = codeBlock?.querySelector('code');
      const rawCode = codeEl?.textContent || '';
      if (rawCode) {
        navigator.clipboard.writeText(rawCode);
        const prevText = copyBtn.innerText;
        copyBtn.innerText = '✓ Copiato!';
        setTimeout(() => {
          copyBtn.innerText = prevText || '📋 Copia';
        }, 1600);
        showToast('📋 Codice copiato negli appunti!');
      }
      return;
    }

    // Delete code block button
    const delCodeBtn = target.closest('.note-code-del-btn') as HTMLElement | null;
    if (delCodeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const codeBlock = delCodeBtn.closest('.note-code-block');
      if (codeBlock) {
        codeBlock.remove();
        handleEditorInput();
        showToast('Blocco codice rimosso.');
      }
      return;
    }

    // Delete formula box button
    const delFormulaBtn = target.closest('.note-formula-del-btn') as HTMLElement | null;
    if (delFormulaBtn) {
      e.preventDefault();
      e.stopPropagation();
      const formulaBox = delFormulaBtn.closest('.note-formula-box');
      if (formulaBox) {
        formulaBox.remove();
        handleEditorInput();
        showToast('Box formula rimossa.');
      }
      return;
    }

    // Track if user clicked an image inside #notes-area (Word-style movable & anchored image bar)
    const clickedImg = target.closest('img') as HTMLImageElement | null;
    if (clickedImg && notesAreaRef.current?.contains(clickedImg)) {
      notesAreaRef.current.querySelectorAll('img.selected-note-image').forEach(el => {
        if (el !== clickedImg) el.classList.remove('selected-note-image');
      });
      clickedImg.classList.add('selected-note-image');
      const layout = (clickedImg.getAttribute('data-layout') as ImageLayoutMode) || 'inline';
      const pinned = clickedImg.getAttribute('data-pinned') === 'true';
      const rawW = parseInt(clickedImg.getAttribute('data-width-pct') || '60', 10);
      setSelectedImageEl(clickedImg);
      setSelectedImageMeta({
        layout,
        pinned,
        widthPct: isNaN(rawW) ? 60 : rawW
      });
    } else if (selectedImageEl) {
      notesAreaRef.current?.querySelectorAll('img.selected-note-image').forEach(el => {
        el.classList.remove('selected-note-image');
      });
      setSelectedImageEl(null);
    }

    // Track if user clicked inside an interactive table cell (.note-table td or th)
    const clickedCell = target.closest('.note-table td, .note-table th') as HTMLTableCellElement | null;
    if (clickedCell && notesAreaRef.current?.contains(clickedCell)) {
      setActiveTableCell(clickedCell);
    } else if (activeTableCell) {
      setActiveTableCell(null);
    }
  };

  // ==========================================
  // INTERACTIVE TABLES IN NOTES (INSERT & EDIT ROWS/COLS)
  // ==========================================
  const handleInsertInteractiveTable = (rows = 3, cols = 3) => {
    if (!notesAreaRef.current) return;
    const tableHtml = buildInteractiveTableHtml(rows, cols);
    insertHtmlAtEditorCursor(tableHtml);
    setTimeout(() => {
      if (!notesAreaRef.current) return;
      const tables = notesAreaRef.current.querySelectorAll('table.note-table');
      const lastTable = tables[tables.length - 1] as HTMLTableElement | undefined;
      const firstCell = lastTable?.querySelector('td, th') as HTMLTableCellElement | null;
      if (firstCell) {
        firstCell.focus();
        setActiveTableCell(firstCell);
      }
    }, 25);
    showToast('📊 Tabella inserita negli appunti! Clicca su una cella per aggiungere/rimuovere righe o colonne.');
  };

  const handleTableOperation = (
    op: 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col' | 'del-table'
  ) => {
    if (!activeTableCell || !notesAreaRef.current?.contains(activeTableCell)) {
      showToast('Seleziona prima una cella della tabella.', 'error');
      return;
    }
    const table = activeTableCell.closest('table.note-table') as HTMLTableElement | null;
    const wrapper = activeTableCell.closest('.note-table-wrapper') as HTMLElement | null;
    const currentRow = activeTableCell.closest('tr') as HTMLTableRowElement | null;
    if (!table || !currentRow) return;

    const allRows = Array.from(table.querySelectorAll('tr'));
    const colIndex = Array.from(currentRow.children).indexOf(activeTableCell);
    const colCount = currentRow.children.length;

    if (op === 'del-table') {
      (wrapper || table).remove();
      setActiveTableCell(null);
      handleEditorInput();
      showToast('🗑️ Tabella rimossa.');
      return;
    }

    if (op === 'row-above' || op === 'row-below') {
      const newRow = document.createElement('tr');
      for (let c = 0; c < colCount; c++) {
        const td = document.createElement('td');
        td.innerHTML = '&nbsp;';
        newRow.appendChild(td);
      }
      if (op === 'row-above') {
        currentRow.parentNode?.insertBefore(newRow, currentRow);
      } else {
        currentRow.parentNode?.insertBefore(newRow, currentRow.nextSibling);
      }
      handleEditorInput();
      showToast(op === 'row-above' ? '+ Riga aggiunta sopra.' : '+ Riga aggiunta sotto.');
      return;
    }

    if (op === 'del-row') {
      if (allRows.length <= 1) {
        (wrapper || table).remove();
        setActiveTableCell(null);
      } else {
        currentRow.remove();
        const nextCell = table.querySelector('td, th') as HTMLTableCellElement | null;
        setActiveTableCell(nextCell);
      }
      handleEditorInput();
      showToast('− Riga eliminata.');
      return;
    }

    if (op === 'col-left' || op === 'col-right') {
      allRows.forEach((tr, rIdx) => {
        const isHeader = tr.parentElement?.tagName === 'THEAD' || rIdx === 0;
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.innerHTML = isHeader ? `Col ${colCount + 1}` : '&nbsp;';
        const refCell = tr.children[colIndex] || null;
        if (op === 'col-left') {
          tr.insertBefore(cell, refCell);
        } else {
          tr.insertBefore(cell, refCell ? refCell.nextSibling : null);
        }
      });
      handleEditorInput();
      showToast(op === 'col-left' ? '+ Colonna aggiunta a sinistra.' : '+ Colonna aggiunta a destra.');
      return;
    }

    if (op === 'del-col') {
      if (colCount <= 1) {
        (wrapper || table).remove();
        setActiveTableCell(null);
      } else {
        allRows.forEach(tr => {
          const targetCell = tr.children[colIndex];
          if (targetCell) targetCell.remove();
        });
        const nextCell = table.querySelector('td, th') as HTMLTableCellElement | null;
        setActiveTableCell(nextCell);
      }
      handleEditorInput();
      showToast('− Colonna eliminata.');
    }
  };

  // ==========================================
  // MOVABLE & ANCHORED IMAGES IN NOTES (WORD-STYLE)
  // ==========================================
  const handleImageLayoutChange = (mode: ImageLayoutMode) => {
    if (!selectedImageEl || !notesAreaRef.current?.contains(selectedImageEl)) return;
    selectedImageEl.setAttribute('data-layout', mode);
    if (mode === 'front' || mode === 'behind') {
      selectedImageEl.style.position = 'absolute';
      if (!selectedImageEl.style.left) selectedImageEl.style.left = '32px';
      if (!selectedImageEl.style.top) {
        const editorRect = notesAreaRef.current.getBoundingClientRect();
        const imgRect = selectedImageEl.getBoundingClientRect();
        const relTop = Math.max(16, Math.round(imgRect.top - editorRect.top + notesAreaRef.current.scrollTop));
        selectedImageEl.style.top = `${relTop}px`;
      }
    } else {
      selectedImageEl.style.position = '';
      selectedImageEl.style.left = '';
      selectedImageEl.style.top = '';
    }
    setSelectedImageMeta(prev => ({ ...prev, layout: mode }));
    handleEditorInput();
    const labels: Record<ImageLayoutMode, string> = {
      inline: 'In linea col testo',
      'wrap-left': 'Affiancata a Sinistra',
      'wrap-right': 'Affiancata a Destra',
      behind: 'Dietro al testo (libera)',
      front: 'Davanti al testo (libera)'
    };
    showToast(`🖼️ Posizione foto: ${labels[mode]}`);
  };

  const handleToggleImagePin = () => {
    if (!selectedImageEl || !notesAreaRef.current?.contains(selectedImageEl)) return;
    const nextPinned = !selectedImageMeta.pinned;
    selectedImageEl.setAttribute('data-pinned', nextPinned ? 'true' : 'false');
    setSelectedImageMeta(prev => ({ ...prev, pinned: nextPinned }));
    handleEditorInput();
    showToast(
      nextPinned
        ? '📌 Foto ancorata e fissata nella posizione attuale!'
        : '🔓 Ancora sbloccata: puoi trascinare liberamente la foto negli appunti!'
    );
  };

  const handleImageWidthChange = (nextPct: number) => {
    if (!selectedImageEl || !notesAreaRef.current?.contains(selectedImageEl)) return;
    const clamped = Math.max(15, Math.min(100, Math.round(nextPct)));
    selectedImageEl.setAttribute('data-width-pct', String(clamped));
    selectedImageEl.style.width = `${clamped}%`;
    selectedImageEl.style.maxWidth = `${clamped}%`;
    setSelectedImageMeta(prev => ({ ...prev, widthPct: clamped }));
    handleEditorInput();
  };

  const handleDeleteSelectedImage = () => {
    if (!selectedImageEl) return;
    selectedImageEl.remove();
    setSelectedImageEl(null);
    handleEditorInput();
    showToast('🗑️ Immagine rimossa dagli appunti.');
  };

  // Dragging unpinned images inside #notes-area
  const handleNotesMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!notesAreaRef.current) return;
    const target = e.target as HTMLElement;

    // 1. If in Drawing Mode, start drawing stroke on SVG overlay
    if (isDrawingMode) {
      if (
        target.closest('.note-image-floating-bar') ||
        target.closest('.note-table-floating-bar') ||
        target.closest('.notes-drawing-bar')
      ) {
        return;
      }
      e.preventDefault();
      const editor = notesAreaRef.current;
      let svg = editor.querySelector('svg.note-drawing-svg') as SVGSVGElement | null;
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'note-drawing-svg');
        svg.setAttribute('data-drawing-layer', 'true');
        editor.appendChild(svg);
      }
      const totalH = Math.max(editor.scrollHeight, editor.clientHeight);
      svg.style.height = `${totalH}px`;

      // If eraser tool is active, clicking a stroke deletes it
      if (drawingTool === 'eraser') {
        const hitDrawItem = target.closest('[data-draw-item="true"]');
        if (hitDrawItem && svg.contains(hitDrawItem)) {
          hitDrawItem.remove();
          handleEditorInput();
        }
        return;
      }

      const rect = editor.getBoundingClientRect();
      const x = e.clientX - rect.left + editor.scrollLeft;
      const y = e.clientY - rect.top + editor.scrollTop;
      activeDrawPointsRef.current = [{ x, y }];
      isPointerDrawingRef.current = true;

      const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wrapper.innerHTML = buildSvgElementString(drawingTool, [{ x, y }], drawingColor, drawingWidth);
      const firstChild = wrapper.firstElementChild as SVGElement | null;
      if (firstChild) {
        svg.appendChild(firstChild);
        tempDrawElementRef.current = firstChild;
      }
      return;
    }

    // 2. If clicking an image that is NOT pinned, allow dragging it freely
    const imgEl = target.closest('img') as HTMLImageElement | null;
    if (imgEl && notesAreaRef.current.contains(imgEl)) {
      const isPinned = imgEl.getAttribute('data-pinned') === 'true';
      const layout = (imgEl.getAttribute('data-layout') as ImageLayoutMode) || 'inline';
      if (!isPinned && (layout === 'front' || layout === 'behind' || e.altKey)) {
        e.preventDefault();
        if (layout !== 'front' && layout !== 'behind') {
          imgEl.setAttribute('data-layout', 'front');
          imgEl.style.position = 'absolute';
        }
        const editorRect = notesAreaRef.current.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        const origLeft =
          parseFloat(imgEl.style.left) ||
          Math.max(0, Math.round(imgRect.left - editorRect.left + notesAreaRef.current.scrollLeft));
        const origTop =
          parseFloat(imgEl.style.top) ||
          Math.max(0, Math.round(imgRect.top - editorRect.top + notesAreaRef.current.scrollTop));

        imgEl.style.left = `${origLeft}px`;
        imgEl.style.top = `${origTop}px`;
        draggingImageRef.current = {
          img: imgEl,
          startX: e.clientX,
          startY: e.clientY,
          origLeft,
          origTop
        };
      }
    }
  };

  const handleNotesMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!notesAreaRef.current) return;

    // 1. Live SVG Drawing update
    if (isDrawingMode && isPointerDrawingRef.current && drawingTool !== 'eraser') {
      const editor = notesAreaRef.current;
      const svg = editor.querySelector('svg.note-drawing-svg') as SVGSVGElement | null;
      if (!svg) return;
      const rect = editor.getBoundingClientRect();
      const x = e.clientX - rect.left + editor.scrollLeft;
      const y = e.clientY - rect.top + editor.scrollTop;
      activeDrawPointsRef.current.push({ x, y });

      if (tempDrawElementRef.current) {
        tempDrawElementRef.current.remove();
        tempDrawElementRef.current = null;
      }
      const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wrapper.innerHTML = buildSvgElementString(
        drawingTool,
        activeDrawPointsRef.current,
        drawingColor,
        drawingWidth
      );
      const nextChild = wrapper.firstElementChild as SVGElement | null;
      if (nextChild) {
        svg.appendChild(nextChild);
        tempDrawElementRef.current = nextChild;
      }
      return;
    }

    // 2. Live Image Drag update
    if (draggingImageRef.current) {
      const { img, startX, startY, origLeft, origTop } = draggingImageRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nextLeft = Math.max(0, Math.round(origLeft + dx));
      const nextTop = Math.max(0, Math.round(origTop + dy));
      img.style.left = `${nextLeft}px`;
      img.style.top = `${nextTop}px`;
    }
  };

  const handleNotesMouseUp = () => {
    if (isPointerDrawingRef.current) {
      isPointerDrawingRef.current = false;
      tempDrawElementRef.current = null;
      activeDrawPointsRef.current = [];
      handleEditorInput();
    }
    if (draggingImageRef.current) {
      draggingImageRef.current = null;
      handleEditorInput();
    }
  };

  const handleUndoLastDrawing = () => {
    if (!notesAreaRef.current) return;
    const svg = notesAreaRef.current.querySelector('svg.note-drawing-svg');
    const items = svg?.querySelectorAll('[data-draw-item="true"]');
    if (items && items.length > 0) {
      items[items.length - 1].remove();
      handleEditorInput();
      showToast('↩️ Ultimo tratto rimosso.');
    } else {
      showToast('Nessun tratto disegnato da annullare.', 'error');
    }
  };

  const handleClearAllDrawings = () => {
    if (!notesAreaRef.current) return;
    const svg = notesAreaRef.current.querySelector('svg.note-drawing-svg');
    if (svg) {
      svg.remove();
      handleEditorInput();
      showToast('🧹 Tutti i disegni sulla pagina sono stati rimossi.');
    }
  };

  // Handle language <select> change inside #notes-area code blocks
  const handleNotesAreaChange = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && target.classList.contains('note-code-lang-select')) {
      const selectEl = target as HTMLSelectElement;
      const newLang = selectEl.value || 'javascript';
      const codeBlock = selectEl.closest('.note-code-block') as HTMLElement | null;
      if (codeBlock) {
        codeBlock.setAttribute('data-lang', newLang);
        // Update selected attribute on <option> elements so innerHTML serialization preserves the language
        const options = selectEl.querySelectorAll('option');
        options.forEach(opt => {
          if (opt.value === newLang) {
            opt.setAttribute('selected', 'selected');
          } else {
            opt.removeAttribute('selected');
          }
        });
        const codeEl = codeBlock.querySelector('.note-code-content') as HTMLElement | null;
        if (codeEl) {
          const rawCode = codeEl.textContent || '';
          codeEl.innerHTML = highlightCodeSyntax(rawCode, newLang);
        }
        handleEditorInput();
        const langObj = CODE_LANGUAGES.find(l => l.id === newLang);
        showToast(`🎨 Linguaggio codice impostato su ${langObj?.label || newLang}`);
      }
    }
  };

  // Handle Tab, Shift+Tab, Enter auto-indentation inside .note-code-pre, and Enter inside .note-formula-input
  const handleNotesAreaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const sel = window.getSelection();
    const anchorNode = sel?.anchorNode;
    const activeEl =
      anchorNode
        ? anchorNode.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as HTMLElement)
          : anchorNode.parentElement
        : target;

    const codePre = (activeEl?.closest('.note-code-pre') || target?.closest('.note-code-pre')) as HTMLElement | null;
    if (codePre) {
      const codeBlock = codePre.closest('.note-code-block') as HTMLElement | null;
      const lang = codeBlock?.getAttribute('data-lang') || 'javascript';
      const codeEl = (codePre.querySelector('.note-code-content') as HTMLElement | null) || codePre;

      if (
        e.key === 'Tab' ||
        e.key === 'Enter' ||
        (e.key === '{' && !e.ctrlKey && !e.metaKey)
      ) {
        const rawCode = codeEl.textContent || '';
        const offsets = getSelectionCharOffsetsWithin(codeEl);
        const start = offsets ? offsets.start : rawCode.length;
        const end = offsets ? offsets.end : start;

        const editResult = computeCodeKeyDownEdit(rawCode, start, end, e.key, e.shiftKey);
        if (editResult) {
          e.preventDefault();
          e.stopPropagation();
          codeEl.innerHTML = highlightCodeSyntax(editResult.newCode, lang);
          setCaretCharOffsetWithin(codeEl, editResult.newCaret);
          handleEditorInput();
          return;
        }
      }
      return;
    }

    const formulaInputEl = (activeEl?.closest('.note-formula-input') || target?.closest('.note-formula-input')) as HTMLElement | null;
    if (formulaInputEl) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const formulaBox = formulaInputEl.closest('.note-formula-box');
        if (formulaBox && sel) {
          const range = document.createRange();
          range.setStartAfter(formulaBox);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  // Handle live syntax re-highlighting in .note-code-pre and live formula evaluation in .note-formula-input on input
  const handleNotesAreaInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const sel = window.getSelection();
    const anchorNode = sel?.anchorNode;
    const activeEl =
      anchorNode
        ? anchorNode.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as HTMLElement)
          : anchorNode.parentElement
        : target;

    // 1. Live Formula Box evaluation
    const formulaInputEl = (activeEl?.closest('.note-formula-input') || target?.closest('.note-formula-input')) as HTMLElement | null;
    if (formulaInputEl) {
      const formulaBox = formulaInputEl.closest('.note-formula-box') as HTMLElement | null;
      const outputEl = formulaBox?.querySelector('.note-formula-output') as HTMLElement | null;
      if (outputEl) {
        const expr = (formulaInputEl.textContent || '').trim();
        const evaluated = evaluateMathExpression(expr);
        if (evaluated !== null) {
          outputEl.textContent = `= ${evaluated}`;
          outputEl.classList.add('has-result');
          outputEl.classList.remove('is-symbolic');
        } else {
          outputEl.textContent = expr ? '= ?' : '= ...';
          outputEl.classList.remove('has-result');
          outputEl.classList.add('is-symbolic');
        }
      }
      handleEditorInput();
      return;
    }

    // 2. Live Code Block syntax highlighting while preserving caret
    const codePre = (activeEl?.closest('.note-code-pre') || target?.closest('.note-code-pre')) as HTMLElement | null;
    if (codePre) {
      const codeBlock = codePre.closest('.note-code-block') as HTMLElement | null;
      const lang = codeBlock?.getAttribute('data-lang') || 'javascript';
      const codeEl = (codePre.querySelector('.note-code-content') as HTMLElement | null) || codePre;
      const offsets = getSelectionCharOffsetsWithin(codeEl);
      const rawCode = codeEl.textContent || '';
      const highlighted = highlightCodeSyntax(rawCode, lang);
      if (codeEl.innerHTML !== highlighted) {
        codeEl.innerHTML = highlighted;
        if (offsets) {
          setCaretCharOffsetWithin(codeEl, offsets.end);
        }
      }
      handleEditorInput();
      return;
    }

    // Also update any formula boxes inside #notes-area if input event bubbled from parent
    if (notesAreaRef.current) {
      const allFormulaBoxes = notesAreaRef.current.querySelectorAll('.note-formula-box');
      allFormulaBoxes.forEach(box => {
        const inp = box.querySelector('.note-formula-input') as HTMLElement | null;
        const out = box.querySelector('.note-formula-output') as HTMLElement | null;
        if (inp && out) {
          const expr = (inp.textContent || '').trim();
          const evaluated = evaluateMathExpression(expr);
          const nextText = evaluated !== null ? `= ${evaluated}` : expr ? '= ?' : '= ...';
          if (out.textContent !== nextText) {
            out.textContent = nextText;
          }
          if (evaluated !== null) {
            out.classList.add('has-result');
            out.classList.remove('is-symbolic');
          } else {
            out.classList.remove('has-result');
            out.classList.add('is-symbolic');
          }
        }
      });
    }

    handleEditorInput();
  };

  // Paste Screenshot / Image directly into Notes (#notes-area)
  const handleNotesPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        try {
          showToast('📸 Elaborazione screenshot in corso...');
          const compressed = await compressImageFromBlob(blob, 1150, 0.84);
          const imgHtml = `<img src="${compressed.dataUrl}" alt="Screenshot Appunti" class="note-pasted-screenshot" /><p><br></p>`;
          insertHtmlAtEditorCursor(imgHtml);
          showToast('📸 Screenshot incollato negli appunti!');
        } catch (err) {
          console.error('Screenshot paste error:', err);
          showToast('Errore durante l\'incollaggio dello screenshot.', 'error');
        }
        return;
      }
    }
  };

  // Paste Screenshot / Image directly into AI Chat (#user-chat-input / .ai-chat-panel)
  const handleChatPaste = async (e: React.ClipboardEvent<HTMLElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        try {
          const compressed = await compressImageFromBlob(blob, 1280, 0.86);
          const timeStamp = new Date().toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).replace(/:/g, '-');
          setAttachedFile({
            name: `Screenshot_${timeStamp}.jpg`,
            mimeType: compressed.mimeType,
            data: compressed.base64
          });
          if (isChatCollapsed) {
            setIsChatCollapsed(false);
          }
          showToast('📸 Screenshot allegato alla Chat AI! Premi Invia per analizzarlo.');
        } catch (err) {
          console.error('Chat screenshot paste error:', err);
          showToast('Errore nell\'allegare lo screenshot alla chat.', 'error');
        }
        return;
      }
    }
  };

  // Programmable Keyboard Shortcuts Listener (Configurable in Impostazioni -> Scorciatoie Tasti)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFindBarOpen) setIsFindBarOpen(false);
        if (isDrawingMode) setIsDrawingMode(false);
        return;
      }

      if (!currentUser || !isApproved) return;

      const s = {
        ...(DEFAULT_SHORTCUTS as Record<ShortcutActionId, string>),
        ...customShortcuts
      };

      if (matchesShortcutCombo(e, s.open_find)) {
        if (activeTab === 'notes') {
          e.preventDefault();
          setIsFindBarOpen(true);
          const sel = window.getSelection();
          const selText = sel && !sel.isCollapsed ? sel.toString().trim() : '';
          if (selText) setFindQuery(selText);
          setTimeout(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
          }, 40);
        }
        return;
      }

      if (matchesShortcutCombo(e, s.insert_code)) {
        e.preventDefault();
        setActiveTab('notes');
        handleInsertDirectCodeBlock();
        return;
      }

      if (matchesShortcutCombo(e, s.insert_formula)) {
        e.preventDefault();
        setActiveTab('notes');
        handleInsertDirectFormulaBox();
        return;
      }

      if (matchesShortcutCombo(e, s.insert_table)) {
        e.preventDefault();
        setActiveTab('notes');
        handleInsertInteractiveTable(3, 3);
        return;
      }

      if (matchesShortcutCombo(e, s.toggle_pen)) {
        e.preventDefault();
        setActiveTab('notes');
        setIsDrawingMode(prev => !prev);
        return;
      }

      if (matchesShortcutCombo(e, s.insert_quote)) {
        e.preventDefault();
        setActiveTab('notes');
        handleInsertBlockquote();
        return;
      }

      if (matchesShortcutCombo(e, s.highlight_text)) {
        e.preventDefault();
        const topColor = savedHighlightColors[0] || '#fde047';
        handleFormatText('hiliteColor', topColor);
        handleFormatText('foreColor', '#09090b');
        return;
      }

      if (matchesShortcutCombo(e, s.new_page)) {
        e.preventDefault();
        if (workspaceMode === 'shared') {
          handleAddNewRoomPage();
        } else {
          handleAddNewPage();
        }
        return;
      }

      if (matchesShortcutCombo(e, s.toggle_chat)) {
        e.preventDefault();
        handleToggleChat();
        return;
      }

      if (matchesShortcutCombo(e, s.toggle_sidebar)) {
        e.preventDefault();
        handleToggleSidebar();
        return;
      }

      if (matchesShortcutCombo(e, s.toggle_compact)) {
        e.preventDefault();
        handleToggleCompactMode(!compactMode);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    currentUser,
    isApproved,
    isFindBarOpen,
    isDrawingMode,
    customShortcuts,
    savedHighlightColors,
    workspaceMode,
    compactMode
  ]);

  // Count matches whenever findQuery or note content changes
  useEffect(() => {
    if (!isFindBarOpen || !findQuery.trim() || !notesAreaRef.current) {
      setFindMatchCount(0);
      return;
    }
    const plain = notesAreaRef.current.innerText || '';
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = plain.match(new RegExp(escaped, 'gi'));
    setFindMatchCount(matches ? matches.length : 0);
  }, [isFindBarOpen, findQuery, pages, activeSubject, activePageId, activeRoomPages, activeRoomPageId]);

  // Navigate to next/previous occurrence in #notes-area
  const handleFindStep = (backwards: boolean = false) => {
    if (!findQuery.trim() || !notesAreaRef.current) return;
    const query = findQuery.trim();
    // Walk text nodes inside #notes-area to select matching text cleanly without leaving #notes-area
    const walker = document.createTreeWalker(notesAreaRef.current, NodeFilter.SHOW_TEXT, null);
    const matches: { node: Text; start: number; end: number }[] = [];
    const lowerQ = query.toLowerCase();
    let currentNode = walker.nextNode() as Text | null;
    while (currentNode) {
      const text = currentNode.nodeValue || '';
      const lowerText = text.toLowerCase();
      let idx = lowerText.indexOf(lowerQ);
      while (idx !== -1) {
        matches.push({ node: currentNode, start: idx, end: idx + query.length });
        idx = lowerText.indexOf(lowerQ, idx + query.length);
      }
      currentNode = walker.nextNode() as Text | null;
    }

    if (matches.length === 0) {
      showToast(`Nessuna corrispondenza per "${query}"`, 'error');
      return;
    }

    // Determine next index based on current selection
    const sel = window.getSelection();
    let currentMatchIdx = -1;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      currentMatchIdx = matches.findIndex(
        m => m.node === r.startContainer && m.start === r.startOffset
      );
    }

    const nextIdx = backwards
      ? (currentMatchIdx - 1 + matches.length) % matches.length
      : (currentMatchIdx + 1) % matches.length;

    const target = matches[nextIdx];
    const range = document.createRange();
    range.setStart(target.node, target.start);
    range.setEnd(target.node, target.end);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    lastEditorRangeRef.current = range.cloneRange();
    const parentEl = target.node.parentElement;
    parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Replace current or all matches inside #notes-area
  const handleReplaceInNotes = (replaceAll: boolean = false) => {
    if (!findQuery.trim() || !notesAreaRef.current) return;
    const walker = document.createTreeWalker(notesAreaRef.current, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    let n = walker.nextNode() as Text | null;
    while (n) {
      textNodes.push(n);
      n = walker.nextNode() as Text | null;
    }

    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, replaceAll ? 'gi' : 'i');
    let replacedCount = 0;

    for (const tNode of textNodes) {
      const val = tNode.nodeValue || '';
      if (regex.test(val)) {
        tNode.nodeValue = val.replace(regex, () => {
          replacedCount++;
          return replaceQuery;
        });
        if (!replaceAll && replacedCount > 0) break;
      }
    }

    if (replacedCount > 0) {
      handleEditorInput();
      showToast(`✓ Sostituit${replacedCount === 1 ? 'a 1 occorrenza' : `e ${replacedCount} occorrenze`}!`);
    } else {
      showToast('Nessuna corrispondenza da sostituire.', 'error');
    }
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

  // Context Menu for Notes Area (Flips Upwards / Leftwards when near screen edges)
  const handleNotesContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    let range: Range | null = null;
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0).cloneRange();
      if (notesAreaRef.current?.contains(range.commonAncestorContainer)) {
        lastEditorRangeRef.current = range.cloneRange();
      }
    }

    const estimatedWidth = 320;
    const estimatedHeight = text ? 440 : 340;
    const pos = computeContextMenuPosition(
      e.clientX,
      e.clientY,
      estimatedWidth,
      estimatedHeight,
      window.innerWidth,
      window.innerHeight,
      12
    );

    setContextMenu({
      visible: true,
      x: pos.x,
      y: pos.y,
      clickX: e.clientX,
      clickY: e.clientY,
      selectedText: text,
      savedRange: range
    });
    e.preventDefault();
  };

  // Refine Context Menu position using actual rendered DOM bounding box so it never clips off-screen
  useEffect(() => {
    if (!contextMenu.visible || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const adjusted = computeContextMenuPosition(
      contextMenu.clickX,
      contextMenu.clickY,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
      12
    );
    if (Math.abs(adjusted.x - contextMenu.x) > 1 || Math.abs(adjusted.y - contextMenu.y) > 1) {
      setContextMenu(prev => ({
        ...prev,
        x: adjusted.x,
        y: adjusted.y
      }));
    }
  }, [contextMenu.visible, contextMenu.clickX, contextMenu.clickY, contextMenu.selectedText]);

  const handleContextMenuAction = (action: string) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    const { selectedText, savedRange } = contextMenu;

    const restoreSavedRange = () => {
      if (notesAreaRef.current) {
        notesAreaRef.current.focus();
      }
      if (savedRange) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        lastEditorRangeRef.current = savedRange.cloneRange();
      }
    };

    if (action === 'incolla_ai') {
      if (lastAIResponse && notesAreaRef.current) {
        restoreSavedRange();
        document.execCommand('insertHTML', false, marked.parse(lastAIResponse) as string);
        handleEditorInput();
        showToast('Risposta AI incollata!');
      }
      return;
    }

    if (action === 'calcola_selezione') {
      restoreSavedRange();
      handleInsertDirectFormulaBox(selectedText);
      return;
    }

    if (action === 'citazione') {
      restoreSavedRange();
      handleInsertBlockquote();
      return;
    }

    if (action === 'blocco_codice') {
      restoreSavedRange();
      handleInsertDirectCodeBlock(selectedText);
      return;
    }

    if (action === 'formula') {
      restoreSavedRange();
      handleInsertDirectFormulaBox(selectedText);
      return;
    }

    if (action === 'tabella') {
      restoreSavedRange();
      handleInsertInteractiveTable(3, 3);
      return;
    }

    if (action === 'penna') {
      setIsDrawingMode(prev => !prev);
      return;
    }

    if (action === 'cerca') {
      setIsFindBarOpen(true);
      if (selectedText) setFindQuery(selectedText);
      setTimeout(() => findInputRef.current?.focus(), 40);
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

  // Word count for active note
  const activeNoteRawHtml =
    workspaceMode === 'shared'
      ? (activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0])?.content || ''
      : (currentSubPages.find(p => p.id === activePageId) || currentSubPages[0])?.content || '';
  const activeNotePlainText = activeNoteRawHtml.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  const activeNoteWordCount = activeNotePlainText ? activeNotePlainText.split(/\s+/).filter(Boolean).length : 0;

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

        {/* Version Badge in Bottom-Left Corner */}
        <div className="app-version-badge" title="Versione attiva di Workspace ITS">
          <span className="app-version-dot"></span>
          <span>Workspace ITS {APP_VERSION}</span>
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
              onClick={() => handleToggleCompactMode(!compactMode)}
              title="Attiva/Disattiva Modalità Minimal Senza Sfondo & Spazi Compatti"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: compactMode ? 'var(--accent-surface)' : 'transparent',
                borderColor: compactMode ? 'var(--accent-border)' : 'transparent',
                color: compactMode ? '#fff' : undefined
              }}
            >
              ⚡ {compactMode ? 'Minimal Attiva' : 'Minimal'}
            </button>
            <button
              className="top-btn"
              onClick={() => {
                setSettingsInitialTab('widgets');
                setIsSettingsModalOpen(true);
              }}
              title="Apri Studio Layout & Widget: aggiungi visualizzatore PDF sotto la Chat, Sito Web, Calcolatrice o inverti le colonne"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: customWidgets.some(w => w.enabled) ? 'var(--accent-surface)' : 'transparent',
                borderColor: customWidgets.some(w => w.enabled) ? 'var(--accent-border)' : 'transparent',
                color: customWidgets.some(w => w.enabled) ? '#c7d2fe' : undefined
              }}
            >
              🧩 Widget {customWidgets.filter(w => w.enabled).length > 0 ? `(${customWidgets.filter(w => w.enabled).length})` : ''}
            </button>
            <button
              className="top-btn"
              onClick={() => setIsBackupModalOpen(true)}
              title="Salva o Ripristina il backup dei tuoi appunti e corsi"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              💾 Backup
            </button>
            <button
              className="top-btn"
              onClick={() => {
                setSettingsInitialTab('appearance');
                setIsSettingsModalOpen(true);
              }}
              title="Personalizza sfondi monocolore, colore barre, widget, font in pixel, meteo e chiavi API"
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

      {/* Main Multi-Column Dashboard Container (Supports Dedicated Full-Column Widgets) */}
      <div
        className={`dashboard-container layout-${columnLayout} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${
          isChatCollapsed ? 'chat-collapsed' : ''
        } ${customWidgets.some(w => w.enabled && w.slot === 'full_column') ? 'has-widget-column' : ''}`}
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

          {/* Left Bottom Modular Widgets Dock */}
          <WorkspaceWidgetsDock
            slot="left_bottom"
            widgets={customWidgets}
            materials={activeDisplayMaterials}
            onUpdateWidget={handleUpdateSingleWidget}
            onRemoveWidget={handleRemoveSingleWidget}
            onOpenWidgetSettings={() => {
              setSettingsInitialTab('widgets');
              setIsSettingsModalOpen(true);
            }}
            onOpenFullPreview={handleOpenPreview}
            onInsertTextIntoNotes={(text: string) => {
              insertHtmlAtEditorCursor(`<span class="note-formula-chip" contenteditable="false">${text}</span>&nbsp;`);
            }}
            showToast={showToast}
          />
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

              {/* Compact Drive Bar (can be hidden in Settings for extra vertical space) */}
              {showDriveBar && (
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
              )}
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

                {/* Minimal & Intuitive Rich Text Toolbar with Exact Pixel (px) Font Size, Code, Quote, Formula & Search */}
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

                  {/* Exact Pixel (px) Font Size Controller */}
                  <div
                    className="toolbar-px-group"
                    title="Dimensione testo in Pixel (px): seleziona del testo per ridimensionarlo o cambia la grandezza predefinita della nota"
                  >
                    <button
                      type="button"
                      className="px-step-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleApplyPixelFontSize(toolbarPxSize - 1)}
                      title="Riduci di 1px"
                    >
                      −
                    </button>
                    <div className="toolbar-px-input-wrap">
                      <input
                        type="number"
                        className="toolbar-px-input"
                        min={8}
                        max={96}
                        value={toolbarPxSize}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setToolbarPxSize(val);
                          }
                        }}
                        onBlur={e => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            handleApplyPixelFontSize(val);
                          } else {
                            setToolbarPxSize(fontSize);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = parseInt((e.target as HTMLInputElement).value, 10);
                            if (!isNaN(val)) {
                              handleApplyPixelFontSize(val);
                            }
                          }
                        }}
                        title="Inserisci dimensione esatta in pixel (8–96px) e premi Invio"
                      />
                      <span className="toolbar-px-unit">px</span>
                    </div>
                    <button
                      type="button"
                      className="px-step-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleApplyPixelFontSize(toolbarPxSize + 1)}
                      title="Aumenta di 1px"
                    >
                      +
                    </button>

                    {/* Quick Pixel Presets */}
                    <div className="toolbar-px-presets">
                      {[13, 15, 18, 22, 28].map(pSize => (
                        <button
                          key={pSize}
                          type="button"
                          className={`px-preset-btn ${toolbarPxSize === pSize ? 'active' : ''}`}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleApplyPixelFontSize(pSize)}
                          title={`Imposta dimensione a ${pSize}px`}
                        >
                          {pSize}
                        </button>
                      ))}
                    </div>
                  </div>

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

                  <span className="divider"></span>

                  {/* Highlighter Swatches (with Color Wheel + Deletable Rapid Swatches) */}
                  <div className="toolbar-swatch-group" title="Evidenziatore testo (passa sopra un colore per eliminarlo o usa la ruota 🎨)">
                    <span className="toolbar-swatch-label">🖍️</span>
                    {savedHighlightColors.map(color => (
                      <div key={color} className="swatch-dot-wrap">
                        <button
                          type="button"
                          className="swatch-dot-btn"
                          style={{ backgroundColor: color }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            handleFormatText('hiliteColor', color);
                            handleFormatText('foreColor', '#09090b');
                          }}
                          title={`Evidenzia ${color}`}
                        />
                        <button
                          type="button"
                          className="swatch-del-badge"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            handleUpdateSavedHighlightColors(removeColorFromPalette(savedHighlightColors, color));
                          }}
                          title="Elimina questo colore rapido"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label
                      className="color-wheel-label-btn"
                      title="Ruota colori personalizzata Evidenziatore (salva automaticamente nei colori rapidi)"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <input
                        type="color"
                        defaultValue="#fde047"
                        onChange={e => {
                          const hex = e.target.value;
                          handleUpdateSavedHighlightColors(addColorToPalette(savedHighlightColors, hex));
                          handleFormatText('hiliteColor', hex);
                          handleFormatText('foreColor', '#09090b');
                        }}
                      />
                    </label>
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

                  {/* Text Color Swatches (with Color Wheel + Deletable Rapid Swatches) */}
                  <div className="toolbar-swatch-group" title="Colore del testo (passa sopra un colore per eliminarlo o usa la ruota 🎨)">
                    <span className="toolbar-swatch-label">A</span>
                    {savedTextColors.map(color => (
                      <div key={color} className="swatch-dot-wrap">
                        <button
                          type="button"
                          className="swatch-dot-btn"
                          style={{ backgroundColor: color }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleFormatText('foreColor', color)}
                          title={`Testo ${color}`}
                        />
                        <button
                          type="button"
                          className="swatch-del-badge"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            handleUpdateSavedTextColors(removeColorFromPalette(savedTextColors, color));
                          }}
                          title="Elimina questo colore rapido"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label
                      className="color-wheel-label-btn"
                      title="Ruota colori personalizzata Testo (salva automaticamente nei colori rapidi)"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <input
                        type="color"
                        defaultValue="#38bdf8"
                        onChange={e => {
                          const hex = e.target.value;
                          handleUpdateSavedTextColors(addColorToPalette(savedTextColors, hex));
                          handleFormatText('foreColor', hex);
                        }}
                      />
                    </label>
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

                  {/* Interactive Table Insertion */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleInsertInteractiveTable(3, 3)}
                    title={`Inserisci Tabella modificabile negli appunti (${customShortcuts.insert_table || 'Alt+T'})`}
                  >
                    📊 Tabella
                  </button>

                  {/* Freehand Drawing Pen Tool */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setIsDrawingMode(prev => !prev)}
                    title={`Attiva/Disattiva Penna Disegno a mano libera su appunti e foto (${customShortcuts.toggle_pen || 'Alt+P'})`}
                    style={
                      isDrawingMode
                        ? {
                            background: 'var(--accent-gradient)',
                            color: '#fff',
                            borderColor: 'transparent',
                            boxShadow: '0 2px 10px rgba(99, 102, 241, 0.45)'
                          }
                        : undefined
                    }
                  >
                    ✏️ {isDrawingMode ? 'Penna Attiva' : 'Penna'}
                  </button>

                  {/* Restored Citazione & Syntax-Highlighted Code Block */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleInsertBlockquote}
                    title={`Inserisci Citazione / Definizione (${customShortcuts.insert_quote || 'Alt+Q'})`}
                  >
                    💬 Citazione
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleInsertDirectCodeBlock()}
                    title={`Inserisci Box di Codice negli appunti (${customShortcuts.insert_code || 'Alt+C'})`}
                  >
                    💻 Codice
                  </button>

                  {/* Direct Inline Live Formula Box */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleInsertDirectFormulaBox()}
                    title={`Inserisci Box Formula Live negli appunti (${customShortcuts.insert_formula || 'Alt+F'})`}
                    style={{
                      color: '#6ee7b7',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      background: 'rgba(16, 185, 129, 0.1)'
                    }}
                  >
                    ∑ Formula / =
                  </button>

                  {/* Ctrl+F Search inside Notes */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      setIsFindBarOpen(prev => !prev);
                      setTimeout(() => findInputRef.current?.focus(), 40);
                    }}
                    title={`Cerca e Sostituisci negli appunti (${customShortcuts.open_find || 'Ctrl+F'})`}
                  >
                    🔍 Cerca
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
                    <span className="notes-stats-pill" title="Conteggio parole nella pagina corrente">
                      {activeNoteWordCount} {activeNoteWordCount === 1 ? 'parola' : 'parole'}
                    </span>
                    <button
                      type="button"
                      className="editor-action-btn file-dl"
                      onClick={handleCopyWholeNote}
                      title="Copia tutto il testo della nota negli appunti"
                    >
                      📋 Copia
                    </button>
                    <button
                      type="button"
                      className="editor-action-btn drive-save"
                      onClick={handleSaveNoteToGoogleDrive}
                      disabled={isSavingToDrive}
                      title="Salva questa nota come documento nel tuo Google Drive personale"
                    >
                      {isSavingToDrive ? '⏳...' : '☁️ Drive'}
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

                {/* Floating Freehand Drawing Studio Bar (when ✏️ Penna is active) */}
                {isDrawingMode && (
                  <div className="notes-drawing-bar">
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#a5b4fc' }}>
                      ✏️ Disegno su Appunti &amp; Foto:
                    </span>
                    {(
                      [
                        { id: 'pen', label: '✏️ Penna' },
                        { id: 'highlighter', label: '🖍️ Evidenziatore' },
                        { id: 'arrow', label: '↗️ Freccia' },
                        { id: 'line', label: '📏 Linea' },
                        { id: 'rect', label: '▭ Box' },
                        { id: 'eraser', label: '🧹 Gomma Tratto' }
                      ] as Array<{ id: DrawingToolType; label: string }>
                    ).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className={`drawing-tool-pill ${drawingTool === t.id ? 'active' : ''}`}
                        onClick={() => setDrawingTool(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}

                    <span className="divider" style={{ height: '18px' }}></span>

                    {/* Pen Color Swatches + Custom Color Wheel + Delete */}
                    <div className="toolbar-swatch-group" title="Colore Penna / Freccia">
                      {savedPenColors.map(c => (
                        <div key={c} className="swatch-dot-wrap">
                          <button
                            type="button"
                            className="swatch-dot-btn"
                            style={{
                              backgroundColor: c,
                              outline: drawingColor === c ? '2px solid #ffffff' : 'none'
                            }}
                            onClick={() => setDrawingColor(c)}
                            title={`Colore tratto ${c}`}
                          />
                          <button
                            type="button"
                            className="swatch-del-badge"
                            onClick={e => {
                              e.stopPropagation();
                              handleUpdateSavedPenColors(removeColorFromPalette(savedPenColors, c));
                            }}
                            title="Elimina colore rapido penna"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <label
                        className="color-wheel-label-btn"
                        title="Scegli colore penna dalla ruota colori (salva nei rapidi)"
                      >
                        <input
                          type="color"
                          value={drawingColor.startsWith('#') ? drawingColor : '#38bdf8'}
                          onChange={e => {
                            const hex = e.target.value;
                            setDrawingColor(hex);
                            handleUpdateSavedPenColors(addColorToPalette(savedPenColors, hex));
                          }}
                        />
                      </label>
                    </div>

                    {/* Stroke Widths */}
                    {[2, 4, 7, 12].map(w => (
                      <button
                        key={w}
                        type="button"
                        className={`drawing-tool-pill ${drawingWidth === w ? 'active' : ''}`}
                        onClick={() => setDrawingWidth(w)}
                        title={`Spessore tratto ${w}px`}
                      >
                        {w}px
                      </button>
                    ))}

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <button
                        type="button"
                        className="drawing-tool-pill"
                        onClick={handleUndoLastDrawing}
                        title="Annulla ultimo tratto disegnato"
                      >
                        ↩️ Annulla Tratto
                      </button>
                      <button
                        type="button"
                        className="drawing-tool-pill danger"
                        onClick={handleClearAllDrawings}
                        title="Cancella tutti i disegni da questa pagina"
                      >
                        🗑️ Pulisci Tutto
                      </button>
                      <button
                        type="button"
                        className="drawing-tool-pill"
                        onClick={() => setIsDrawingMode(false)}
                        title="Torna alla modalità scrittura testo (Esc)"
                      >
                        ✓ Fine Disegno
                      </button>
                    </div>
                  </div>
                )}

                {/* Floating Interactive Table Editing Bar (when cursor is inside a .note-table) */}
                {activeTableCell && (
                  <div className="note-table-floating-bar">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                      📊 Gestione Tabella:
                    </span>
                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('row-above')}
                    >
                      + Riga Sopra
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('row-below')}
                    >
                      + Riga Sotto
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('col-left')}
                    >
                      + Col Sinistra
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('col-right')}
                    >
                      + Col Destra
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('del-row')}
                    >
                      − Elimina Riga
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('del-col')}
                    >
                      − Elimina Colonna
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      style={{ marginLeft: 'auto' }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTableOperation('del-table')}
                    >
                      🗑️ Elimina Tabella
                    </button>
                  </div>
                )}

                {/* Floating Word-Style Image Layout & Anchor Toolbar (when clicking an image in #notes-area) */}
                {selectedImageEl && (
                  <div className="note-image-floating-bar">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc' }}>
                      🖼️ Layout &amp; Ancora Foto:
                    </span>
                    {(
                      [
                        { id: 'inline', label: '═ In linea' },
                        { id: 'wrap-left', label: '◧ Testo a Destra' },
                        { id: 'wrap-right', label: '◨ Testo a Sinistra' },
                        { id: 'behind', label: '🌅 Dietro al Testo' },
                        { id: 'front', label: '🚀 Davanti al Testo (Libera)' }
                      ] as Array<{ id: ImageLayoutMode; label: string }>
                    ).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className={`drawing-tool-pill ${selectedImageMeta.layout === m.id ? 'active' : ''}`}
                        onClick={() => handleImageLayoutChange(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}

                    <button
                      type="button"
                      className={`drawing-tool-pill ${selectedImageMeta.pinned ? 'active' : ''}`}
                      onClick={handleToggleImagePin}
                      title="Blocca/Fissa la foto con l'ancora oppure sbloccala per trascinarla liberamente col mouse"
                    >
                      {selectedImageMeta.pinned ? '📌 Fissata (Sblocca)' : '🔓 Sbloccata (Fissa Ancora)'}
                    </button>

                    <span className="divider" style={{ height: '18px' }}></span>

                    {[25, 50, 75, 100].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        className={`drawing-tool-pill ${selectedImageMeta.widthPct === pct ? 'active' : ''}`}
                        onClick={() => handleImageWidthChange(pct)}
                        title={`Dimensione foto ${pct}%`}
                      >
                        {pct}%
                      </button>
                    ))}

                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onClick={() => setIsDrawingMode(true)}
                      title="Attiva la penna per disegnare frecce o appunti direttamente sopra questa foto"
                    >
                      ✏️ Disegna su Foto
                    </button>

                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      style={{ marginLeft: 'auto' }}
                      onClick={handleDeleteSelectedImage}
                      title="Elimina questa immagine dagli appunti"
                    >
                      🗑️ Elimina Foto
                    </button>
                  </div>
                )}

                {/* Floating Ctrl+F Search & Replace Bar */}
                {isFindBarOpen && (
                  <div className="notes-find-bar">
                    <span style={{ fontSize: '0.82rem' }}>🔍</span>
                    <input
                      ref={findInputRef}
                      type="text"
                      className="notes-find-input"
                      placeholder="Cerca negli appunti (Invio = successivo)..."
                      value={findQuery}
                      onChange={e => setFindQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFindStep(e.shiftKey);
                        } else if (e.key === 'Escape') {
                          setIsFindBarOpen(false);
                        }
                      }}
                    />
                    <span className="notes-find-count">
                      {findQuery.trim() ? `${findMatchCount} trovati` : '0'}
                    </span>
                    <button
                      type="button"
                      className="widget-mini-btn"
                      onClick={() => handleFindStep(true)}
                      title="Occorrenza precedente (Shift+Invio)"
                    >
                      ▲ Prec
                    </button>
                    <button
                      type="button"
                      className="widget-mini-btn accent"
                      onClick={() => handleFindStep(false)}
                      title="Occorrenza successiva (Invio)"
                    >
                      ▼ Succ
                    </button>
                    <input
                      type="text"
                      className="notes-find-input"
                      placeholder="Sostituisci con..."
                      value={replaceQuery}
                      onChange={e => setReplaceQuery(e.target.value)}
                      style={{ maxWidth: '160px' }}
                    />
                    <button
                      type="button"
                      className="widget-mini-btn"
                      onClick={() => handleReplaceInNotes(false)}
                      title="Sostituisci prima occorrenza"
                    >
                      Sostituisci
                    </button>
                    <button
                      type="button"
                      className="widget-mini-btn"
                      onClick={() => handleReplaceInNotes(true)}
                      title="Sostituisci tutte le occorrenze"
                    >
                      Tutti
                    </button>
                    <button
                      type="button"
                      className="widget-ctrl-btn danger"
                      onClick={() => setIsFindBarOpen(false)}
                      title="Chiudi barra di ricerca (Esc)"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Contenteditable Notes Area (Supports Ctrl+V Screenshot Paste, Tables, Movable Photos & SVG Pen) */}
                <div
                  id="notes-area"
                  className={`font-${fontFamily} ${isDrawingMode ? 'drawing-mode-active' : ''} ${
                    isDrawingMode && drawingTool === 'eraser' ? 'eraser-active' : ''
                  }`}
                  style={{ fontSize: `${fontSize}px` }}
                  ref={el => {
                    (notesAreaRef as any).current = el;
                    if (el) {
                      const currentSubPages = pages[activeSubject] || [];
                      const currentPage = currentSubPages.find(p => p.id === activePageId) || currentSubPages[0];
                      const rawTarget = workspaceMode === 'shared'
                        ? (activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0])?.content || ''
                        : (currentPage?.content || '');
                      const targetContent = sanitizeAndUpgradeNoteHtml(rawTarget).cleanedHtml;
                      if (el.innerHTML !== targetContent) {
                        el.innerHTML = targetContent;
                      }
                    }
                  }}
                  contentEditable={!isDrawingMode}
                  suppressContentEditableWarning
                  data-placeholder="Inizia a scrivere i tuoi appunti... Incolla screenshot (Ctrl+V), inserisci tabelle, disegna con la penna o usa le scorciatoie."
                  onInput={handleNotesAreaInput}
                  onChange={handleNotesAreaChange}
                  onKeyDown={handleNotesAreaKeyDown}
                  onPaste={handleNotesPaste}
                  onClick={handleNotesAreaClick}
                  onMouseDown={handleNotesMouseDown}
                  onMouseMove={handleNotesMouseMove}
                  onMouseUp={e => {
                    handleNotesMouseUp();
                    handleRecordEditorSelection();
                  }}
                  onKeyUp={handleRecordEditorSelection}
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

          {/* Center Bottom Modular Widgets Dock (Under Notes) */}
          <WorkspaceWidgetsDock
            slot="center_bottom"
            widgets={customWidgets}
            materials={activeDisplayMaterials}
            onUpdateWidget={handleUpdateSingleWidget}
            onRemoveWidget={handleRemoveSingleWidget}
            onOpenWidgetSettings={() => {
              setSettingsInitialTab('widgets');
              setIsSettingsModalOpen(true);
            }}
            onOpenFullPreview={handleOpenPreview}
            onInsertTextIntoNotes={(text: string) => {
              insertHtmlAtEditorCursor(`<span class="note-formula-chip" contenteditable="false">${text}</span>&nbsp;`);
            }}
            showToast={showToast}
          />
        </div>

        {/* Right Column: AI Copilot Panel + Bottom Modular Widgets (PDF / Web / Image / Calculator) */}
        <div
          className={`panel chat-column ${
            customWidgets.some(w => w.enabled && w.slot === 'right_bottom') ? 'has-bottom-widgets' : ''
          } ${mobileTab === 'chat' ? 'mobile-active' : ''}`}
          id="chat-column"
          onPaste={handleChatPaste}
        >
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
              <div className="chat-controls-hide" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="expand-btn"
                  onClick={() => {
                    setSettingsInitialTab('widgets');
                    setIsSettingsModalOpen(true);
                  }}
                  title="Aggiungi un PDF, una Foto, un Sito Web o una Calcolatrice sotto la Chat"
                >
                  🧩 +Widget
                </button>
                {workspaceMode === 'personal' && (
                  <button className="expand-btn" onClick={handleClearChatHistory} title="Pulisci cronologia chat">
                    🧹
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
                  Chiedi qualcosa, incolla uno screenshot (<b>Ctrl+V</b>) o premi <b>🔍 Analizza Note</b> per lavorare sugli appunti di{' '}
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
                        {hasFile && <small style={{ opacity: 0.8 }}>📎 Screenshot / File Allegato</small>}
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

            {/* File Upload & Pasted Screenshot Preview Bar */}
            <div className="file-upload-preview-bar" style={{ flexWrap: 'wrap' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button className="chat-btn" onClick={() => fileInputRef.current?.click()} title="Allega un file o incolla direttamente uno screenshot con Ctrl+V">
                📎 Allega / Ctrl+V
              </button>
              {attachedFile && (
                <div id="attached-file-badge" style={{ maxWidth: '100%' }}>
                  {attachedFile.mimeType.startsWith('image/') && (
                    <img
                      src={`data:${attachedFile.mimeType};base64,${attachedFile.data}`}
                      alt="Preview"
                      style={{ width: '22px', height: '22px', objectFit: 'cover', borderRadius: '4px' }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                    {attachedFile.name}
                  </span>
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

            {/* Input Row (Supports Ctrl+V Screenshot Paste) */}
            <div className="chat-input-row" style={{ marginTop: '8px' }}>
              <input
                type="text"
                id="user-chat-input"
                placeholder="Chiedi a Gemini o incolla screenshot (Ctrl+V)..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onPaste={handleChatPaste}
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

          {/* Right Bottom Modular Widgets Dock (Under Chat AI - e.g. PDF Viewer, Website, Image, Calculator) */}
          <WorkspaceWidgetsDock
            slot="right_bottom"
            widgets={customWidgets}
            materials={activeDisplayMaterials}
            onUpdateWidget={handleUpdateSingleWidget}
            onRemoveWidget={handleRemoveSingleWidget}
            onOpenWidgetSettings={() => {
              setSettingsInitialTab('widgets');
              setIsSettingsModalOpen(true);
            }}
            onOpenFullPreview={handleOpenPreview}
            onInsertTextIntoNotes={(text: string) => {
              insertHtmlAtEditorCursor(buildInteractiveFormulaBoxHtml(text));
            }}
            showToast={showToast}
          />
        </div>

        {/* Dedicated Full-Height Column for Large Widgets (PDF Viewer, Website, Image, Calculator, etc.) */}
        {customWidgets.some(w => w.enabled && w.slot === 'full_column') && (
          <div className="panel widget-column" id="widget-column">
            <WorkspaceWidgetsDock
              slot="full_column"
              widgets={customWidgets}
              materials={activeDisplayMaterials}
              onUpdateWidget={handleUpdateSingleWidget}
              onRemoveWidget={handleRemoveSingleWidget}
              onOpenWidgetSettings={() => {
                setSettingsInitialTab('widgets');
                setIsSettingsModalOpen(true);
              }}
              onOpenFullPreview={handleOpenPreview}
              onInsertTextIntoNotes={(text: string) => {
                insertHtmlAtEditorCursor(buildInteractiveFormulaBoxHtml(text));
              }}
              showToast={showToast}
              columnWidth={widgetColumnWidth}
              onChangeColumnWidth={handleChangeWidgetColumnWidth}
            />
          </div>
        )}
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

      {/* CUSTOM CONTEXT MENU FOR NOTES (VIEWPORT-AWARE FLIP & BOXED TOOLBOX SECTIONS) */}
      {contextMenu.visible && (() => {
        const inlineMath = contextMenu.selectedText ? evaluateMathExpression(contextMenu.selectedText) : null;
        const cleanedSelectedExpr = contextMenu.selectedText.replace(/=\s*$/, '').trim();
        return (
          <div
            ref={contextMenuRef}
            className="custom-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Box 1: Stile Testo & Evidenziatori */}
            <div className="ctx-group-box">
              <div className="ctx-group-box-header">
                <span>🎨 Stile &amp; Evidenziatori</span>
              </div>
              <div className="ctx-toolbar-row">
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleFormatText('bold');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  title="Grassetto (Ctrl+B)"
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleFormatText('italic');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  title="Corsivo (Ctrl+I)"
                >
                  <i>I</i>
                </button>
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleFormatText('underline');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  title="Sottolineato (Ctrl+U)"
                >
                  <u>U</u>
                </button>
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleFormatText('strikeThrough');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  title="Barrato"
                >
                  <s>S</s>
                </button>

                {/* Quick Highlighters + Custom Color Wheel */}
                {savedHighlightColors.slice(0, 4).map(color => (
                  <button
                    key={color}
                    type="button"
                    className="ctx-swatch-btn"
                    style={{ background: color }}
                    onMouseDown={e => {
                      e.preventDefault();
                      handleFormatText('hiliteColor', hexToHighlightRgba(color, 0.38));
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    title={`Evidenzia ${color}`}
                  />
                ))}
                <label
                  className="color-wheel-label-btn"
                  title="Scegli colore personalizzato dalla ruota colori"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <input
                    type="color"
                    defaultValue="#38bdf8"
                    onChange={e => {
                      const hex = e.target.value;
                      handleUpdateSavedTextColors(addColorToPalette(savedTextColors, hex));
                      handleFormatText('foreColor', hex);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Box 2: Dimensione Testo in Pixel */}
            <div className="ctx-group-box">
              <div className="ctx-group-box-header">
                <span>📏 Dimensione Testo (px)</span>
                <span className="ctx-px-readout">{toolbarPxSize}px</span>
              </div>
              <div className="ctx-toolbar-row">
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleApplyPixelFontSize(toolbarPxSize - 2);
                  }}
                  title="Riduci di 2px"
                >
                  A−
                </button>
                <button
                  type="button"
                  className="ctx-tool-btn"
                  onMouseDown={e => {
                    e.preventDefault();
                    handleApplyPixelFontSize(toolbarPxSize + 2);
                  }}
                  title="Ingrandisci di 2px"
                >
                  A+
                </button>
                {[13, 16, 20, 26].map(px => (
                  <button
                    key={px}
                    type="button"
                    className="ctx-tool-btn"
                    style={{ width: 'auto', padding: '0 7px', fontSize: '0.7rem' }}
                    onMouseDown={e => {
                      e.preventDefault();
                      handleApplyPixelFontSize(px);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                  >
                    {px}px
                  </button>
                ))}
              </div>
            </div>

            {/* Live Math Expression Result if Selection is Calculable */}
            {inlineMath !== null && (
              <div
                className="ctx-math-banner"
                onClick={() => handleContextMenuAction('calcola_selezione')}
                title="Clicca per inserire la box formula con il risultato negli appunti"
              >
                <span>🧮 <b>{cleanedSelectedExpr} = {inlineMath}</b></span>
                <span className="ctx-math-action">Inserisci Box =</span>
              </div>
            )}

            {/* Box 3: Inserimento Rapido Toolbox (3x2 Grid) */}
            <div className="ctx-group-box">
              <div className="ctx-group-box-header">
                <span>🧰 Toolbox Inserimento Rapido</span>
              </div>
              <div className="ctx-box-grid">
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('blocco_codice')}
                >
                  <span>💻</span>
                  <span>Box Codice</span>
                </button>
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('formula')}
                >
                  <span>∑</span>
                  <span>Box Formula</span>
                </button>
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('tabella')}
                >
                  <span>📊</span>
                  <span>Tabella</span>
                </button>
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('penna')}
                >
                  <span>✏️</span>
                  <span>Penna Disegno</span>
                </button>
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('citazione')}
                >
                  <span>💬</span>
                  <span>Citazione</span>
                </button>
                <button
                  type="button"
                  className="ctx-box-action-btn"
                  onClick={() => handleContextMenuAction('cerca')}
                >
                  <span>🔍</span>
                  <span>Cerca Ctrl+F</span>
                </button>
              </div>
            </div>

            {/* Box 4: Azioni AI Gemini */}
            <div className="ctx-group-box">
              <div className="ctx-group-box-header">
                <span>🤖 Azioni AI Gemini</span>
              </div>
              {contextMenu.selectedText ? (
                <>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('correggi')}>
                    <span>✨ Correggi grammatica</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('migliora')}>
                    <span>🚀 Migliora scrittura</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('riassumi')}>
                    <span>📝 Riassumi selezione</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('spiega')}>
                    <span>🧠 Spiegami questo</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('traduci')}>
                    <span>🌍 Traduci e Analizza</span>
                  </div>
                </>
              ) : (
                <div
                  className="context-menu-item"
                  onClick={() => handleContextMenuAction('incolla_ai')}
                  style={{ opacity: lastAIResponse ? 1 : 0.5, pointerEvents: lastAIResponse ? 'auto' : 'none' }}
                >
                  <span>📋 {lastAIResponse ? 'Incolla ultima risposta AI' : 'Seleziona testo per le azioni AI'}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* MODALE INSERIMENTO BLOCCO DI CODICE CON SCELTA LINGUAGGIO E SYNTAX HIGHLIGHTING */}
      {isCodeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCodeModalOpen(false)}>
          <div className="modal-box" style={{ maxWidth: '640px', width: '94%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💻 Inserisci Blocco di Codice con Syntax Highlighting</span>
              <button className="modal-close" onClick={() => setIsCodeModalOpen(false)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                1. Seleziona il linguaggio di programmazione:
              </div>
              <div className="code-lang-pills">
                {CODE_LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    type="button"
                    className={`code-lang-pill ${codeModalLang === lang.id ? 'active' : ''}`}
                    onClick={() => setCodeModalLang(lang.id)}
                  >
                    <span>[{lang.badge}]</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '4px' }}>
                2. Scrivi o incolla il codice:
              </div>
              <textarea
                value={codeModalText}
                onChange={e => setCodeModalText(e.target.value)}
                placeholder="Incolla o digita qui il tuo codice..."
                rows={7}
                style={{
                  width: '100%',
                  background: '#090d16',
                  color: '#e2e8f0',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.82rem',
                  lineHeight: 1.55,
                  resize: 'vertical',
                  outline: 'none'
                }}
                autoFocus
              />

              {/* Anteprima Live Colorata */}
              {codeModalText.trim() && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Anteprima colorazione sintassi ({CODE_LANGUAGES.find(l => l.id === codeModalLang)?.label}):
                  </div>
                  <div
                    style={{ maxHeight: '150px', overflowY: 'auto' }}
                    dangerouslySetInnerHTML={{
                      __html: buildHighlightedCodeBlockHtml(codeModalText, codeModalLang)
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button className="dialog-btn" onClick={() => setIsCodeModalOpen(false)}>
                  Annulla
                </button>
                <button className="dialog-btn primary" onClick={handleInsertSyntaxCodeBlock}>
                  💻 Inserisci Codice Colorato negli Appunti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CALCOLO DIRETTO & INSERIMENTO FORMULA NEGLI APPUNTI */}
      {isFormulaModalOpen && (() => {
        const liveEval = evaluateMathExpression(formulaInput);
        const cleanFormulaExpr = formulaInput.replace(/=\s*$/, '').trim();
        return (
          <div className="modal-overlay" onClick={() => setIsFormulaModalOpen(false)}>
            <div className="modal-box" style={{ maxWidth: '560px', width: '94%' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">∑ Calcolo Diretto &amp; Inserimento Formula negli Appunti</span>
                <button className="modal-close" onClick={() => setIsFormulaModalOpen(false)}>
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Scrivi un'espressione matematica per calcolarla all'istante (es. <code>(125 * 4) + sqrt(144)</code>) oppure componi una formula con simboli scientifici da inserire come badge negli appunti.
                </div>

                <input
                  type="text"
                  value={formulaInput}
                  onChange={e => setFormulaInput(e.target.value)}
                  placeholder="Es. 250 * 1.22 oppure x = (-b ± √(b² - 4ac)) / 2a"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.95rem',
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.45)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '10px',
                    color: '#fff'
                  }}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInsertFormulaFromModal(true);
                    }
                  }}
                />

                {/* Live Calculation Preview Banner */}
                <div className="formula-live-preview">
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Risultato Calcolo in Tempo Reale
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '2px' }}>
                      {formulaInput.trim() || 'In attesa di espressione...'}
                    </div>
                  </div>
                  <div className="formula-live-result">
                    {liveEval !== null ? `= ${liveEval}` : 'Formula Testuale'}
                  </div>
                </div>

                {/* Simboli Matematici Rapidi */}
                <div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                    Simboli Matematici Rapidi (clicca per aggiungere):
                  </div>
                  <div className="formula-symbol-grid">
                    {FORMULA_SYMBOLS.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        className="formula-sym-btn"
                        onClick={() => setFormulaInput(prev => prev + s.sym)}
                        title={s.label}
                      >
                        {s.sym}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formule Pronte */}
                <div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                    Formule &amp; Modelli Pronti:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {FORMULA_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        className="code-lang-pill"
                        onClick={() => setFormulaInput(preset.expr)}
                      >
                        <span>📐 {preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <button className="dialog-btn" onClick={() => setIsFormulaModalOpen(false)}>
                    Annulla
                  </button>
                  {liveEval !== null && (
                    <button
                      className="dialog-btn"
                      onClick={() => handleInsertFormulaFromModal(false)}
                      title="Inserisci soltanto la formula senza il risultato"
                    >
                      Inserisci Solo Espressione
                    </button>
                  )}
                  <button
                    className="dialog-btn primary"
                    onClick={() => handleInsertFormulaFromModal(true)}
                  >
                    ∑ {liveEval !== null ? `Inserisci "${cleanFormulaExpr} = ${liveEval}"` : 'Inserisci Formula negli Appunti'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSettingsInitialTab(undefined);
        }}
        bgIndex={bgIndex}
        onSelectBackground={handleSelectBgIndex}
        compactMode={compactMode}
        onToggleCompactMode={handleToggleCompactMode}
        accentColor={accentColor}
        onSelectAccentColor={handleSelectAccentColor}
        panelTheme={panelTheme}
        onSelectPanelTheme={handleSelectPanelTheme}
        panelOpacity={panelOpacity}
        onChangePanelOpacity={handleChangePanelOpacity}
        showDriveBar={showDriveBar}
        onToggleShowDriveBar={handleToggleShowDriveBar}
        fontFamily={fontFamily}
        onSelectFontFamily={handleSelectFontFamily}
        fontSize={fontSize}
        onSelectFontSize={handleSelectFontSize}
        showWeatherWidget={showWeatherWidget}
        onToggleShowWeatherWidget={handleToggleWeatherWidget}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapsed={handleToggleSidebar}
        isChatCollapsed={isChatCollapsed}
        onToggleChatCollapsed={handleToggleChat}
        columnLayout={columnLayout}
        onSelectColumnLayout={handleChangeColumnLayout}
        leftColumnWidth={leftColumnWidth}
        onChangeLeftColumnWidth={handleChangeLeftColumnWidth}
        rightColumnWidth={rightColumnWidth}
        onChangeRightColumnWidth={handleChangeRightColumnWidth}
        widgetColumnWidth={widgetColumnWidth}
        onChangeWidgetColumnWidth={handleChangeWidgetColumnWidth}
        chatSplitRatio={chatSplitRatio}
        onChangeChatSplitRatio={handleChangeChatSplitRatio}
        customWidgets={customWidgets}
        onUpdateCustomWidgets={handleUpdateCustomWidgets}
        customShortcuts={customShortcuts}
        onUpdateCustomShortcuts={handleUpdateCustomShortcuts}
        savedTextColors={savedTextColors}
        onUpdateSavedTextColors={handleUpdateSavedTextColors}
        savedHighlightColors={savedHighlightColors}
        onUpdateSavedHighlightColors={handleUpdateSavedHighlightColors}
        savedPenColors={savedPenColors}
        onUpdateSavedPenColors={handleUpdateSavedPenColors}
        materials={activeDisplayMaterials}
        initialTab={settingsInitialTab}
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

      {/* VERSION BADGE IN BOTTOM-LEFT CORNER */}
      <div
        className="app-version-badge"
        title="Versione attiva di Workspace ITS — verifica di avere la stessa versione su tutti i dispositivi"
      >
        <span className="app-version-dot"></span>
        <span>Workspace ITS {APP_VERSION}</span>
      </div>
    </div>
  );
}
