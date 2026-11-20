/**
 * Workspace ITS - Main Application Component
 * Linear/Notion style dashboard with Firebase Cloud Firestore Real-time Sync & Google Auth
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { marked } from 'marked';
import { auth, calendarAuth } from './firebase';
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
  DrawingToolType,
  CalendarEventItem
} from './types';
import { WorkspaceService, DEFAULT_SUBJECTS, DEFAULT_PAGES } from './services/workspaceService';
import { saveFileToIndexedDB, getFileFromIndexedDB, deleteFileFromIndexedDB } from './services/fileStorage';
import { WeatherModal } from './components/WeatherModal';
import { SettingsModal, BACKGROUND_THEMES, ACCENT_THEMES, PANEL_THEMES } from './components/SettingsModal';
import { WorkspaceWidgetsDock } from './components/WorkspaceWidgetsDock';
import { StudyCalendarPanel } from './components/StudyCalendarPanel';
import { StudyReviewModal } from './components/StudyReviewModal';
import { MindMapModal } from './components/MindMapModal';
import { CommandPaletteModal, CommandPaletteAction } from './components/CommandPaletteModal';
import { VoiceDictationBar } from './components/VoiceDictationBar';
import { SplitScreenPane } from './components/SplitScreenPane';
import { ExportDispensaModal } from './components/ExportDispensaModal';
import { reorderPagesList } from './utils/studyTools';
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
  compressImageFromBlob,
  parseAiNoteEditIntent,
  convertAiMarkdownToNoteHtml,
  applyTargetedBoxReplacement,
  normalizeCodeLanguageId,
  parseCalendarChatCommand,
  buildCalendarScheduleContextForChat,
  answerCalendarQueryLocally,
  computeTabSlideDirection
} from './utils/editorTools';
import { uploadNoteToDrive } from './services/googleDriveService';
import { executeCodeBlock } from './services/codeRunnerService';
import {
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  parseIcsCalendarContent,
  CATEGORY_META
} from './services/googleCalendarService';
import { callGeminiWithRotation, normalizeGeminiModelName } from './services/geminiService';
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
    const rawMime = parts.length > 1 ? parts[0].replace('data:', '').trim() : mimeType;
    const contentType =
      mimeType === 'application/pdf' ||
      !rawMime ||
      rawMime === 'application/octet-stream' ||
      rawMime === 'binary/octet-stream'
        ? 'application/pdf'
        : rawMime;
    const raw = window.atob(parts.length > 1 ? parts[1] : parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType });
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
  const [isNotesMaximized] = useState<boolean>(false);
  const [isEditorToolbarCollapsed, setIsEditorToolbarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ws_editor_toolbar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<'notes' | 'materials' | 'calendar'>('notes');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(() =>
    WorkspaceService.getLocalCalendarEvents()
  );
  const deletedCalendarIdsRef = useRef<Set<string>>(new Set());
  const [isSyncingGoogleCalendar, setIsSyncingGoogleCalendar] = useState<boolean>(false);
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState<string | null>(null);
  const [calendarApiEnableUrl, setCalendarApiEnableUrl] = useState<string | null>(null);
  const [aiUndoHtmlSnapshot, setAiUndoHtmlSnapshot] = useState<string | null>(null);
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

  // Selected Movable / Anchored Image & Post-Esc Drawing State in Notes
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null);
  const [selectedDrawingEl, setSelectedDrawingEl] = useState<SVGElement | null>(null);
  const [selectionBoxRect, setSelectionBoxRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectedImageMeta, setSelectedImageMeta] = useState<{
    layout: ImageLayoutMode;
    pinned: boolean;
    widthPct: number;
  }>({
    layout: 'inline',
    pinned: false,
    widthPct: 60
  });
  const notesStageRef = useRef<HTMLDivElement>(null);
  const lastLoadedNoteKeyRef = useRef<string>('');
  const draggingImageRef = useRef<{
    img: HTMLImageElement;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    hasMoved: boolean;
  } | null>(null);
  const draggingDrawingRef = useRef<{
    el: SVGElement;
    startX: number;
    startY: number;
    origTx: number;
    origTy: number;
    origSx: number;
    origSy: number;
  } | null>(null);
  const resizingObjectRef = useRef<{
    kind: 'image' | 'drawing';
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
    origLeft: number;
    origTop: number;
    origTx: number;
    origTy: number;
    origSx: number;
    origSy: number;
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
  const [noteSlideClass, setNoteSlideClass] = useState<'note-slide-from-right' | 'note-slide-from-left' | ''>('');
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const tabElRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevTabRectsRef = useRef<Record<string, number>>({});
  const draggingTabIdRef = useRef<string | null>(null);
  const lastTabSwapTimeRef = useRef<number>(0);
  const didReorderDuringDragRef = useRef<boolean>(false);
  const [isStudyReviewOpen, setIsStudyReviewOpen] = useState<boolean>(false);
  const [isMindMapOpen, setIsMindMapOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState<boolean>(false);
  const [isSplitScreenOpen, setIsSplitScreenOpen] = useState<boolean>(false);
  const [isExportDispensaOpen, setIsExportDispensaOpen] = useState<boolean>(false);
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
    const validUiModels = ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.6-flash'];
    const initialModel = validUiModels.includes(localPref.selectedModel)
      ? localPref.selectedModel
      : localPref.selectedModel?.includes('pro')
      ? 'gemini-3.8-pro'
      : 'gemini-3.8-flash';
    setSelectedModel(initialModel);
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

  const syncedCalendarIdsRef = useRef<Set<string>>(new Set());

  // Listen for Firestore Quota Exhausted circuit breaker to switch cleanly to Local Mode without crashing
  useEffect(() => {
    const onQuotaExceeded = () => {
      if (activeListenersCleanupRef.current) {
        activeListenersCleanupRef.current();
        activeListenersCleanupRef.current = null;
      }
      setCloudSyncActive(false);
      setIsApproved(true);
      showToast(
        '☁️ Quota giornaliera gratuita di Firestore raggiunta: i tuoi appunti e il calendario continuano a salvarsi in automatico in locale sul dispositivo (la quota cloud si azzera domani).',
        'info'
      );
    };
    window.addEventListener('ws-firestore-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('ws-firestore-quota-exceeded', onQuotaExceeded);
  }, [showToast]);

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

        activeListenersCleanupRef.current = () => {
          unsubApproval();
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

        // Auto-sync local notes to Cloud Firestore once per user if not yet migrated
        const migratedKey = `ws_cloud_migrated_${targetUser.uid}`;
        if (!localStorage.getItem(migratedKey)) {
          const hasCloudData = await WorkspaceService.checkHasCloudData(targetUser.uid);
          const localPages = WorkspaceService.getLocalPages();
          const hasLocalData = Object.keys(localPages).some(sub => (localPages[sub] || []).length > 0);

          if (!hasCloudData && hasLocalData) {
            WorkspaceService.migrateLocalDataToCloud(targetUser.uid).then(result => {
              localStorage.setItem(migratedKey, 'true');
              if (result.pagesCount > 0) {
                console.log(`Appunti auto-sincronizzati su Cloud Firestore (${result.pagesCount} pagine).`);
              }
            }).catch(() => {});
          } else if (hasCloudData) {
            localStorage.setItem(migratedKey, 'true');
          }
        }

        // Subscribe to Realtime Firestore updates
        const unsubFirestore = WorkspaceService.subscribeToUserData(targetUser.uid, {
          onPreferences: pref => {
            if (pref.bgIndex !== undefined) setBgIndex(pref.bgIndex);
            if (pref.isSidebarCollapsed !== undefined) setIsSidebarCollapsed(pref.isSidebarCollapsed);
            if (pref.isChatCollapsed !== undefined) setIsChatCollapsed(pref.isChatCollapsed);
            if (pref.selectedModel !== undefined) {
              const allowed = ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.6-flash'];
              const nextModel = allowed.includes(pref.selectedModel)
                ? pref.selectedModel
                : pref.selectedModel?.includes('pro')
                ? 'gemini-3.8-pro'
                : 'gemini-3.8-flash';
              setSelectedModel(nextModel);
            }
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
          },
          onCalendarEvents: cloudEvs => {
            setCalendarEvents(prevLocal => {
              const cloudById = new Map<string, CalendarEventItem>();
              cloudEvs.forEach(ev => {
                if (ev && ev.id && !deletedCalendarIdsRef.current.has(ev.id)) {
                  cloudById.set(ev.id, ev);
                  syncedCalendarIdsRef.current.add(ev.id);
                }
              });

              const unsyncedLocals: CalendarEventItem[] = [];
              prevLocal.forEach(localEv => {
                if (!localEv || !localEv.id || deletedCalendarIdsRef.current.has(localEv.id)) return;
                const existingCloud = cloudById.get(localEv.id);
                if (!existingCloud) {
                  cloudById.set(localEv.id, localEv);
                  if (!syncedCalendarIdsRef.current.has(localEv.id)) {
                    syncedCalendarIdsRef.current.add(localEv.id);
                    unsyncedLocals.push(localEv);
                  }
                } else if ((localEv.updatedAt || 0) > (existingCloud.updatedAt || 0)) {
                  cloudById.set(localEv.id, localEv);
                }
              });

              const merged = Array.from(cloudById.values()).sort((a, b) =>
                (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))
              );
              WorkspaceService.saveLocalCalendarEvents(merged);

              if (unsyncedLocals.length > 0 && user?.uid) {
                unsyncedLocals.forEach(ev => {
                  WorkspaceService.saveCalendarEventToCloud(user.uid, ev).catch(() => {});
                });
              }

              return merged;
            });
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

  // ==========================================
  // CUSTOM STUDY CALENDAR & GOOGLE CALENDAR SYNC HANDLERS
  // ==========================================
  const handleAuthorizeGoogleCalendar = async (forceAccountSelect = false): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.setCustomParameters({
        prompt: forceAccountSelect ? 'select_account consent' : 'select_account'
      });
      // Use isolated calendarAuth so selecting a personal @gmail.com account for Calendar
      // NEVER logs out or switches the primary Workspace ITS user session!
      const result = await signInWithPopup(calendarAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        const calEmail = result.user?.email || null;
        setGoogleOAuthAccessToken(credential.accessToken);
        setGoogleCalendarEmail(calEmail);
        showToast(
          calEmail
            ? `📅 Google Calendar collegato all'account personale (${calEmail})!`
            : '📅 Google Calendar collegato con successo!'
        );
        return credential.accessToken;
      }
      showToast('Token Google Calendar non ricevuto.', 'error');
      return null;
    } catch (err: any) {
      showToast(`Autorizzazione Google Calendar annullata: ${err.message || ''}`, 'error');
      return null;
    }
  };

  const handleSyncGoogleCalendarWithToken = async (tokenToUse: string) => {
    setIsSyncingGoogleCalendar(true);
    try {
      const now = new Date();
      const minDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const maxDate = new Date(now.getFullYear(), now.getMonth() + 4, 0);
      const gEvents = await fetchGoogleCalendarEvents(tokenToUse, minDate.toISOString(), maxDate.toISOString());

      setCalendarEvents(prev => {
        const localOnly = prev.filter(e => !e.googleEventId);
        const byGoogleId = new Map<string, CalendarEventItem>();
        prev.forEach(e => {
          if (e.googleEventId) byGoogleId.set(e.googleEventId, e);
        });

        const mergedGoogle = gEvents.map(ge => {
          const existing = ge.googleEventId ? byGoogleId.get(ge.googleEventId) : undefined;
          return existing
            ? { ...ge, id: existing.id, completed: existing.completed, subject: existing.subject || ge.subject }
            : ge;
        });

        const nextList = [...localOnly, ...mergedGoogle].sort((a, b) =>
          (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))
        );
        WorkspaceService.saveLocalCalendarEvents(nextList);
        if (currentUser) {
          mergedGoogle.forEach(ev => {
            WorkspaceService.saveCalendarEventToCloud(currentUser.uid, ev).catch(() => {});
          });
        }
        return nextList;
      });
      setCalendarApiEnableUrl(null);
      showToast(`📅 Sincronizzati ${gEvents.length} impegni/lezioni dal Google Calendar personale!`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      const urlMatch = msg.match(/https:\/\/console\.[^\s"']+/);
      if (urlMatch) {
        setCalendarApiEnableUrl(urlMatch[0]);
        showToast('⚠️ Attiva Google Calendar API col pulsante giallo comparso nel Calendario e premi Riprova!', 'error');
      } else {
        showToast(`Errore sync Google Calendar: ${msg || 'Riprova riautorizzando Google.'}`, 'error');
        setGoogleOAuthAccessToken(null);
      }
    } finally {
      setIsSyncingGoogleCalendar(false);
    }
  };

  const handleSyncGoogleCalendar = async () => {
    let token = googleOAuthAccessToken;
    if (!token) {
      token = await handleAuthorizeGoogleCalendar(false);
      if (!token) return;
    }
    await handleSyncGoogleCalendarWithToken(token);
  };

  const handleSwitchGoogleCalendarAccount = async () => {
    const token = await handleAuthorizeGoogleCalendar(true);
    if (token) {
      await handleSyncGoogleCalendarWithToken(token);
    }
  };

  const handleImportIcsCalendarFile = async (icsContent: string, fileName: string) => {
    const imported = parseIcsCalendarContent(icsContent, activeSubject || 'Generale');
    if (imported.length === 0) {
      showToast(`Nessun evento trovato nel file "${fileName}". Verifica che sia un file .ics valido.`, 'error');
      return;
    }
    setCalendarEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newOnes = imported.filter(e => !existingIds.has(e.id));
      const nextList = [...prev, ...newOnes].sort((a, b) =>
        (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))
      );
      WorkspaceService.saveLocalCalendarEvents(nextList);
      if (currentUser) {
        newOnes.forEach(ev => {
          WorkspaceService.saveCalendarEventToCloud(currentUser.uid, ev).catch(() => {});
        });
      }
      return nextList;
    });
    showToast(`📥 Importati ${imported.length} impegni/lezioni da "${fileName}"!`);
  };

  const handleAddCalendarEvent = async (
    newEvData: Omit<CalendarEventItem, 'id' | 'updatedAt'>,
    pushToGoogle: boolean
  ) => {
    const id = 'cal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    let googleEventId = '';

    if (pushToGoogle) {
      let token = googleOAuthAccessToken;
      if (!token) {
        token = await handleAuthorizeGoogleCalendar(false);
      }
      if (token) {
        try {
          const createdId = await createGoogleCalendarEvent(token, { ...newEvData, id });
          if (createdId) {
            googleEventId = createdId;
          }
        } catch (err: any) {
          const errMsg = String(err?.message || '');
          // If cached OAuth token expired (401), automatically refresh and retry once
          if (errMsg.includes('401') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('Invalid Credentials')) {
            const refreshedToken = await handleAuthorizeGoogleCalendar(false);
            if (refreshedToken) {
              try {
                const retryId = await createGoogleCalendarEvent(refreshedToken, { ...newEvData, id });
                if (retryId) {
                  googleEventId = retryId;
                }
              } catch (retryErr: any) {
                showToast(`Salvato nel calendario locale (errore Google Calendar: ${retryErr.message})`, 'error');
              }
            }
          } else {
            showToast(`Salvato nel calendario locale (errore Google Calendar: ${errMsg})`, 'error');
          }
        }
      }
    }

    const fullEvent: CalendarEventItem = {
      ...newEvData,
      id,
      googleEventId: googleEventId || '',
      updatedAt: Date.now()
    };

    setCalendarEvents(prev => {
      const filtered = prev.filter(item => item.id !== fullEvent.id);
      const next = [...filtered, fullEvent].sort((a, b) =>
        (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))
      );
      WorkspaceService.saveLocalCalendarEvents(next);
      return next;
    });

    if (currentUser) {
      await WorkspaceService.saveCalendarEventToCloud(currentUser.uid, fullEvent);
    }

    // Trigger native Desktop / Browser notification if permitted
    if ('Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          new Notification(`📅 Impegno programmato: ${fullEvent.title}`, {
            body: `${fullEvent.date} alle ${fullEvent.startTime || '09:00'} (${fullEvent.subject})`,
            icon: './pwa-192x192.png'
          });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification(`📅 Impegno programmato: ${fullEvent.title}`, {
                body: `${fullEvent.date} alle ${fullEvent.startTime || '09:00'} (${fullEvent.subject})`,
                icon: './pwa-192x192.png'
              });
            }
          }).catch(() => {});
        }
      } catch {
        // ignore notification errors in restricted contexts
      }
    }

    showToast(
      googleEventId
        ? `📅 "${fullEvent.title}" salvato nel Cloud e sul tuo Google Calendar Personale!`
        : `📅 "${fullEvent.title}" salvato nel Calendario Studio e sincronizzato nel Cloud!`
    );
  };

  const handleToggleCalendarComplete = async (eventId: string) => {
    let updatedItem: CalendarEventItem | null = null;
    setCalendarEvents(prev => {
      const next = prev.map(ev => {
        if (ev.id === eventId) {
          updatedItem = { ...ev, completed: !ev.completed, updatedAt: Date.now() };
          return updatedItem;
        }
        return ev;
      });
      WorkspaceService.saveLocalCalendarEvents(next);
      return next;
    });
    if (currentUser && updatedItem) {
      await WorkspaceService.saveCalendarEventToCloud(currentUser.uid, updatedItem);
    }
  };

  const handleDeleteCalendarEvent = async (ev: CalendarEventItem) => {
    deletedCalendarIdsRef.current.add(ev.id);
    setCalendarEvents(prev => {
      const next = prev.filter(item => item.id !== ev.id);
      WorkspaceService.saveLocalCalendarEvents(next);
      return next;
    });
    if (currentUser) {
      await WorkspaceService.deleteCalendarEventFromCloud(currentUser.uid, ev.id);
    }
    if (ev.googleEventId && googleOAuthAccessToken) {
      await deleteGoogleCalendarEvent(googleOAuthAccessToken, ev.googleEventId);
    }
    showToast('🗑️ Evento rimosso dal calendario.');
  };

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

  // Helper to get scroll storage key for the current note page
  const getNoteScrollStorageKey = useCallback(() => {
    return workspaceMode === 'shared'
      ? `ws_notes_scroll_shared_${activeRoomId}_${activeRoomPageId}`
      : `ws_notes_scroll_personal_${activeSubject}_${activePageId}`;
  }, [workspaceMode, activeRoomId, activeRoomPageId, activeSubject, activePageId]);

  const handleNotesScroll = useCallback(() => {
    const el = notesAreaRef.current;
    if (!el) return;
    const top = Math.round(el.scrollTop);
    const key = getNoteScrollStorageKey();
    try {
      localStorage.setItem(key, String(top));
      const rawMap = localStorage.getItem('ws_notes_scroll_map');
      const mapObj = rawMap ? JSON.parse(rawMap) : {};
      mapObj[key] = top;
      localStorage.setItem('ws_notes_scroll_map', JSON.stringify(mapObj));
    } catch {
      // ignore storage quota errors
    }
    // Keep selection frame aligned while scrolling
    const activeTarget = selectedImageEl || selectedDrawingEl;
    if (activeTarget && notesStageRef.current && el.contains(activeTarget)) {
      const stageRect = notesStageRef.current.getBoundingClientRect();
      const tRect = activeTarget.getBoundingClientRect();
      setSelectionBoxRect({
        top: Math.round(tRect.top - stageRect.top),
        left: Math.round(tRect.left - stageRect.left),
        width: Math.max(24, Math.round(tRect.width)),
        height: Math.max(24, Math.round(tRect.height))
      });
    }
  }, [getNoteScrollStorageKey, selectedImageEl, selectedDrawingEl]);

  const restoreNotesScrollPosition = useCallback(() => {
    const el = notesAreaRef.current;
    if (!el) return;
    const key = getNoteScrollStorageKey();
    try {
      let savedTop = 0;
      const specificRaw = localStorage.getItem(key);
      if (specificRaw !== null) {
        savedTop = parseInt(specificRaw, 10) || 0;
      } else {
        const rawMap = localStorage.getItem('ws_notes_scroll_map');
        if (rawMap) {
          const mapObj = JSON.parse(rawMap);
          if (typeof mapObj[key] === 'number') {
            savedTop = mapObj[key];
          }
        }
      }
      const targetTop = Math.max(0, savedTop);
      el.scrollTop = targetTop;
      requestAnimationFrame(() => {
        if (notesAreaRef.current) {
          notesAreaRef.current.scrollTop = targetTop;
        }
      });
      setTimeout(() => {
        if (notesAreaRef.current && Math.abs(notesAreaRef.current.scrollTop - targetTop) > 4) {
          notesAreaRef.current.scrollTop = targetTop;
        }
      }, 65);
    } catch {
      // ignore
    }
  }, [getNoteScrollStorageKey]);

  // Dedicated useEffect to persist #notes-area scrollTop to localStorage on scroll
  // and restore the exact scroll position whenever a page, subject, or tab is switched
  useEffect(() => {
    if (activeTab !== 'notes') return;
    const el = notesAreaRef.current;
    if (!el) return;

    restoreNotesScrollPosition();

    const onScrollListener = () => {
      handleNotesScroll();
    };
    el.addEventListener('scroll', onScrollListener, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScrollListener);
    };
  }, [
    activeTab,
    activeSubject,
    activePageId,
    activeRoomId,
    activeRoomPageId,
    workspaceMode,
    restoreNotesScrollPosition,
    handleNotesScroll
  ]);

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
      const noteKey = `shared:${activeRoomId}:${currentRoomPage?.id || ''}:${activeTab}`;
      const isEditingSelf = document.activeElement === notesAreaRef.current;
      if (
        notesAreaRef.current &&
        (lastLoadedNoteKeyRef.current !== noteKey || (!isEditingSelf && !selectedImageEl && !selectedDrawingEl && !isDrawingMode)) &&
        notesAreaRef.current.innerHTML !== targetContent
      ) {
        notesAreaRef.current.innerHTML = targetContent;
        lastLoadedNoteKeyRef.current = noteKey;
        restoreNotesScrollPosition();
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
    const noteKey = `personal:${activeSubject}:${currentPage?.id || ''}:${activeTab}`;
    if (
      notesAreaRef.current &&
      (lastLoadedNoteKeyRef.current !== noteKey || (!notesAreaRef.current.innerHTML.trim() && !!targetContent.trim()))
    ) {
      if (notesAreaRef.current.innerHTML !== targetContent) {
        notesAreaRef.current.innerHTML = targetContent;
      }
      lastLoadedNoteKeyRef.current = noteKey;
      restoreNotesScrollPosition();
    }
    // Update drive link for active subject
    const currentSub = subjects.find(s => s.id === activeSubject);
    setDriveLink(currentSub?.driveLink || '');
  }, [
    workspaceMode,
    activeSubject,
    activePageId,
    pages,
    subjects,
    activeRoomPages,
    activeRoomPageId,
    authLoading,
    activeTab,
    selectedImageEl,
    selectedDrawingEl,
    isDrawingMode,
    restoreNotesScrollPosition
  ]);

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

  // Toggle collapsible notes editor toolbar
  const handleToggleEditorToolbar = () => {
    setIsEditorToolbarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ws_editor_toolbar_collapsed', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Trigger directional lateral slide animation on #notes-area (like modern browser tab switches)
  const triggerNoteSlideAnimation = useCallback((dir: 'from-right' | 'from-left' | null) => {
    if (!dir) return;
    const cls = dir === 'from-right' ? 'note-slide-from-right' : 'note-slide-from-left';
    setNoteSlideClass(cls);
    const el = notesAreaRef.current;
    if (el) {
      el.classList.remove('note-slide-from-right', 'note-slide-from-left');
      // Force reflow so consecutive same-direction tab switches replay smoothly
      void el.offsetWidth;
      el.classList.add(cls);
    }
  }, []);

  const handleSelectPersonalPageTab = useCallback(
    (nextPageId: string) => {
      if (nextPageId === activePageId) return;
      const subPages = pages[activeSubject] || [];
      const dir = computeTabSlideDirection(subPages, activePageId, nextPageId);
      triggerNoteSlideAnimation(dir);
      setActivePageId(nextPageId);
    },
    [activePageId, pages, activeSubject, triggerNoteSlideAnimation]
  );

  const handleSelectSharedRoomPageTab = useCallback(
    (nextPageId: string) => {
      if (nextPageId === activeRoomPageId) return;
      const dir = computeTabSlideDirection(activeRoomPages, activeRoomPageId, nextPageId);
      triggerNoteSlideAnimation(dir);
      setActiveRoomPageId(nextPageId);
    },
    [activeRoomPageId, activeRoomPages, triggerNoteSlideAnimation]
  );

  // Capture tab horizontal positions before live swap so useLayoutEffect can run a smooth FLIP glide
  const captureTabRects = useCallback(() => {
    const rects: Record<string, number> = {};
    Object.entries(tabElRefs.current).forEach(([id, el]) => {
      if (el) rects[id] = el.getBoundingClientRect().left;
    });
    prevTabRectsRef.current = rects;
  }, []);

  // FLIP animation: smoothly slide neighboring tabs when order changes during drag-and-drop
  const tabOrderSignature =
    workspaceMode === 'shared'
      ? activeRoomPages.map(p => p.id).join('|')
      : (pages[activeSubject] || []).map(p => p.id).join('|');

  useLayoutEffect(() => {
    const prevRects = prevTabRectsRef.current;
    if (!prevRects || Object.keys(prevRects).length === 0) return;
    prevTabRectsRef.current = {};

    Object.entries(tabElRefs.current).forEach(([id, el]) => {
      if (!el || prevRects[id] === undefined) return;
      const nextLeft = el.getBoundingClientRect().left;
      const deltaX = prevRects[id] - nextLeft;
      if (Math.abs(deltaX) > 1) {
        el.style.transition = 'none';
        el.style.transform = `translate3d(${deltaX}px, 0, 0)`;
        el.getBoundingClientRect(); // force reflow for FLIP start
        requestAnimationFrame(() => {
          el.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
          el.style.transform = 'translate3d(0, 0, 0)';
        });
        window.setTimeout(() => {
          if (el.style.transform === 'translate3d(0, 0, 0)') {
            el.style.transition = '';
            el.style.transform = '';
          }
        }, 290);
      }
    });
  }, [tabOrderSignature]);

  // Live FLIP swap while dragging a tab across sibling tabs
  const handleLiveSwapNoteTabs = useCallback(
    (draggedId: string, targetId: string, isShared: boolean) => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const now = performance.now();
      if (now - lastTabSwapTimeRef.current < 95) return;

      if (isShared) {
        const fromIdx = activeRoomPages.findIndex(p => p.id === draggedId);
        const toIdx = activeRoomPages.findIndex(p => p.id === targetId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        captureTabRects();
        lastTabSwapTimeRef.current = now;
        didReorderDuringDragRef.current = true;
        setActiveRoomPages(prev => {
          const f = prev.findIndex(p => p.id === draggedId);
          const t = prev.findIndex(p => p.id === targetId);
          if (f === -1 || t === -1 || f === t) return prev;
          return reorderPagesList(prev, f, t);
        });
      } else {
        const list = pages[activeSubject] || [];
        const fromIdx = list.findIndex(p => p.id === draggedId);
        const toIdx = list.findIndex(p => p.id === targetId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        captureTabRects();
        lastTabSwapTimeRef.current = now;
        didReorderDuringDragRef.current = true;
        setPages(prev => {
          const cur = prev[activeSubject] || [];
          const f = cur.findIndex(p => p.id === draggedId);
          const t = cur.findIndex(p => p.id === targetId);
          if (f === -1 || t === -1 || f === t) return prev;
          return { ...prev, [activeSubject]: reorderPagesList(cur, f, t) };
        });
      }
    },
    [activeRoomPages, pages, activeSubject, captureTabRects]
  );

  // Persist final reordered tabs once when drop/drag finishes
  const persistReorderedNoteTabs = useCallback(
    async (isShared: boolean, explicitReordered?: PageItem[]) => {
      if (isShared) {
        const finalList = explicitReordered || activeRoomPages;
        if (activeRoomId) {
          for (const page of finalList) {
            await WorkspaceService.saveRoomPage(activeRoomId, page);
          }
        }
        showToast('Schede condivise riordinate!');
      } else {
        const finalList = explicitReordered || (pages[activeSubject] || []);
        const updatedPages = { ...pages, [activeSubject]: finalList };
        WorkspaceService.saveLocalPages(updatedPages);
        if (currentUser) {
          for (const page of finalList) {
            await WorkspaceService.savePageToCloud(currentUser.uid, activeSubject, page);
          }
        }
        showToast('Ordine schede aggiornato!');
      }
    },
    [activeRoomPages, activeRoomId, pages, activeSubject, currentUser, showToast]
  );

  // Direct drop fallback (e.g. fast drop without intermediate dragOver swap)
  const handleReorderNoteTabs = useCallback(
    async (fromIdx: number, toIdx: number, isShared: boolean) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
      captureTabRects();
      if (isShared) {
        const reordered = reorderPagesList(activeRoomPages, fromIdx, toIdx);
        setActiveRoomPages(reordered);
        await persistReorderedNoteTabs(true, reordered);
      } else {
        const currentList = pages[activeSubject] || [];
        const reordered = reorderPagesList(currentList, fromIdx, toIdx);
        setPages(prev => ({ ...prev, [activeSubject]: reordered }));
        await persistReorderedNoteTabs(false, reordered);
      }
    },
    [activeRoomPages, pages, activeSubject, captureTabRects, persistReorderedNoteTabs]
  );

  // Append structured HTML (e.g., from Voice Dictation) directly into #notes-area and save
  const handleInsertHtmlIntoNotes = useCallback((html: string) => {
    if (!html || !notesAreaRef.current) return;
    setActiveTab('notes');
    const el = notesAreaRef.current;
    el.insertAdjacentHTML('beforeend', `<div style="margin-top:10px;">${html}</div>`);
    el.scrollTop = el.scrollHeight;
    handleEditorInput();
  }, []);

  // Subject change
  const handleSelectSubject = (newSubject: string) => {
    if (newSubject !== activeSubject) {
      const dir = computeTabSlideDirection(subjects, activeSubject, newSubject);
      triggerNoteSlideAnimation(dir || 'from-right');
    }
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
      triggerNoteSlideAnimation('from-right');
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
        triggerNoteSlideAnimation('from-left');
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
      triggerNoteSlideAnimation('from-right');
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
        triggerNoteSlideAnimation('from-left');
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

  // PWA Install & Desktop Direct Install Handler
  const handleInstallAppClick = async () => {
    // 1. Try native browser top popup PWA install prompt first (Chrome / Edge / Brave / Opera with PWA enabled)
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      showToast('🎉 Workspace ITS installata direttamente sul tuo Desktop!');
      return;
    }
    if (outcome === 'dismissed') {
      return;
    }

    // 2. Check if user is on a mobile/tablet device vs Desktop PC
    const ua = navigator.userAgent || '';
    const isMobileOrTablet = /Android|iPhone|iPad|iPod/i.test(ua);
    const isOpera = /OPR\/|Opera/i.test(ua);

    if (!isMobileOrTablet) {
      const wantFallbackFile = await openCustomDialog({
        title: '💻 Installa l\'App direttamente sul Desktop',
        description: isOpera
          ? `Stai usando <b>Opera / Opera GX</b>, che di default disabilita l'avviso automatico in alto per installare le Web-App sul Desktop (a differenza di Chrome, Edge e Brave).<br/><br/>` +
            `<b>Come metterla sul Desktop come vera App senza scaricare file:</b><br/>` +
            `1️⃣ Guarda all'estrema destra della <b>barra degli indirizzi in alto</b>: se vedi l'icona <b>📥 Installa</b> (schermo con freccia), cliccala per aggiungerla subito al Desktop.<br/>` +
            `2️⃣ In alternativa, aprila su <b>Chrome / Edge / Brave</b> e premi <b>💻 Scarica App</b>: comparirà subito il popup in alto che la installa sul Desktop!<br/><br/>` +
            `<i>Vuoi comunque scaricare ora il collegamento rapido Desktop (.html) per Opera?</i>`
          : `Il browser non ha mostrato il popup automatico in alto perché <b>Workspace ITS risulta già installata</b> sul PC oppure il prompt è stato chiuso in precedenza.<br/><br/>` +
            `• Guarda a destra nella <b>barra degli indirizzi in alto</b> e clicca l'icona <b>📥 Apri / Installa l'app Workspace ITS</b> (oppure menu <b>⋮ → Salva e condividi → Installa Workspace ITS</b>) per metterla direttamente sul Desktop senza scaricare file.<br/><br/>` +
            `<i>Oppure premi il pulsante qui sotto se desideri scaricare il file Launcher per il Desktop:</i>`,
        confirmText: '💾 Scarica Launcher Desktop',
        cancelText: 'Chiudi'
      });

      if (!wantFallbackFile) return;

      const rawUrl = window.location.href.split('#')[0];
      const appUrl = rawUrl.replace(/[?&]autostart=1/g, '');
      const iconUrl = new URL('./pwa-192x192.png', window.location.href).href;

      const desktopLauncherHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Workspace ITS — Desktop Launcher</title>
  <link rel="icon" type="image/png" href="${iconUrl}" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #09090b 75%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .card {
      background: rgba(24, 24, 34, 0.9);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 20px;
      padding: 36px 42px;
      max-width: 440px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
    }
    img { width: 72px; height: 72px; border-radius: 16px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 24px; line-height: 1.5; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
    }
  </style>
  <script>
    window.addEventListener('DOMContentLoaded', function() {
      var target = ${JSON.stringify(appUrl)};
      window.location.replace(target);
    });
  </script>
</head>
<body>
  <div class="card">
    <img src="${iconUrl}" alt="Workspace ITS" />
    <h1>Workspace ITS</h1>
    <p>Avvio automatico dell'applicazione desktop in corso...</p>
    <a class="btn" href="${appUrl}">🚀 Apri Workspace ITS</a>
  </div>
</body>
</html>`;

      const blob = new Blob([desktopLauncherHtml], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'Workspace ITS Desktop.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);

      showToast('💻 App Launcher "Workspace ITS Desktop.html" scaricato!');
      return;
    }

    // Mobile fallback (iOS Safari / Android)
    await openCustomDialog({
      title: '📱 Installa Workspace ITS su Telefono / Tablet',
      description:
        `• <b>Su iPhone / iPad (Safari):</b> premi il tasto <b>Condividi</b> e seleziona <b>Aggiungi alla schermata Home</b>.<br/>• <b>Su Android (Chrome):</b> apri il menu <b>⋮</b> in alto a destra e tocca <b>Installa app</b>.`,
      confirmText: 'Ho capito'
    });
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

  // Delegate click inside #notes-area (Run code, copy code, delete code block, delete formula box, language dropdown focus)
  const handleNotesAreaClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Allow interacting with the language <select> inside a code block without contenteditable stealing focus
    if (target.closest('.note-code-lang-select')) {
      e.stopPropagation();
      return;
    }

    // Close code output console button
    const closeOutputBtn = target.closest('.note-code-output-close') as HTMLElement | null;
    if (closeOutputBtn) {
      e.preventDefault();
      e.stopPropagation();
      const outputBox = closeOutputBtn.closest('.note-code-output') as HTMLElement | null;
      if (outputBox) {
        outputBox.style.display = 'none';
        outputBox.innerHTML = '';
        handleEditorInput();
      }
      return;
    }

    // Run code block button (▶ Esegui)
    const runBtn = target.closest('.note-code-run-btn') as HTMLButtonElement | null;
    if (runBtn) {
      e.preventDefault();
      e.stopPropagation();
      const codeBlock = runBtn.closest('.note-code-block') as HTMLElement | null;
      if (!codeBlock) return;
      const selectEl = codeBlock.querySelector('.note-code-lang-select') as HTMLSelectElement | null;
      const lang = selectEl?.value || codeBlock.getAttribute('data-lang') || 'javascript';
      if (selectEl && codeBlock.getAttribute('data-lang') !== lang) {
        codeBlock.setAttribute('data-lang', lang);
      }
      const codeEl = codeBlock.querySelector('code');
      let rawCode = codeEl?.textContent || '';
      if (
        lang === 'sql' &&
        codeEl &&
        rawCode.trim() === 'for (let i = 0; i < 10; i++) {\n    console.log(i);\n}'
      ) {
        rawCode =
          "CREATE TABLE IF NOT EXISTS studenti (\n    id INT PRIMARY KEY AUTOINCREMENT,\n    nome VARCHAR(50),\n    corso VARCHAR(50),\n    voto INT\n);\nINSERT INTO studenti (nome, corso, voto) VALUES ('Marco Rossi', 'Cloud & DevOps', 29), ('Giulia Bianchi', 'Database SQL', 30);\nSELECT * FROM studenti ORDER BY voto DESC;";
        codeEl.innerHTML = highlightCodeSyntax(rawCode, 'sql');
      }
      if (!rawCode.trim()) {
        showToast('Scrivi prima del codice dentro il blocco per eseguirlo!', 'error');
        return;
      }

      let outputBox = codeBlock.querySelector('.note-code-output') as HTMLElement | null;
      if (!outputBox) {
        outputBox = document.createElement('div');
        outputBox.className = 'note-code-output';
        outputBox.setAttribute('contenteditable', 'false');
        codeBlock.appendChild(outputBox);
      }

      const prevBtnText = runBtn.innerText;
      runBtn.innerText = '⏳ Esecuzione...';
      runBtn.disabled = true;
      outputBox.style.display = 'block';
      outputBox.innerHTML = `<div class="note-code-output-header"><span class="note-code-output-badge">⚙️ Esecuzione ${lang.toUpperCase()} in corso...</span></div>`;

      const orderedKeys: string[] = [];
      if (apiKeys[selectedKeyIndex]) orderedKeys.push(apiKeys[selectedKeyIndex]);
      apiKeys.forEach((k, idx) => {
        if (idx !== selectedKeyIndex && k.trim()) orderedKeys.push(k.trim());
      });

      try {
        const res = await executeCodeBlock(rawCode, lang, orderedKeys, selectedModel);
        const escapeOut = (str: string) =>
          str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const isOk = !res.stderr;
        const badgeClass = isOk ? 'note-code-output-badge' : 'note-code-output-badge is-error';
        const statusIcon = isOk ? '✓' : '⚠️';

        let bodyHtml = '';
        const previewHtml = res.htmlContent || res.stdout;
        if (res.isHtmlPreview && previewHtml) {
          bodyHtml = `<div style="margin-top:6px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);background:#fff;"><iframe sandbox="allow-scripts" style="width:100%;height:180px;border:none;display:block;" srcdoc="${previewHtml
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')}"></iframe></div>`;
        } else {
          if (res.stdout) {
            bodyHtml += `<pre class="note-code-output-stdout">${escapeOut(res.stdout)}</pre>`;
          }
          if (res.stderr) {
            bodyHtml += `<pre class="note-code-output-stderr">${escapeOut(res.stderr)}</pre>`;
          }
          if (!res.stdout && !res.stderr) {
            bodyHtml += `<pre class="note-code-output-stdout" style="color:#94a3b8;">(Nessun output stampato)</pre>`;
          }
        }

        outputBox.innerHTML = `
          <div class="note-code-output-header">
            <span class="${badgeClass}">${statusIcon} ${escapeOut(res.engineLabel)} • ${res.durationMs}ms</span>
            <button type="button" class="note-code-output-close" title="Chiudi console output">✕ Chiudi</button>
          </div>
          ${bodyHtml}
        `;
        handleEditorInput();
      } catch (err: any) {
        outputBox.innerHTML = `
          <div class="note-code-output-header">
            <span class="note-code-output-badge is-error">⚠️ Errore Esecuzione</span>
            <button type="button" class="note-code-output-close">✕ Chiudi</button>
          </div>
          <pre class="note-code-output-stderr">${err?.message || 'Errore imprevisto'}</pre>
        `;
      } finally {
        runBtn.innerText = prevBtnText || '▶ Esegui';
        runBtn.disabled = false;
      }
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

    // If user is currently in active Pen Drawing Mode, do NOT open image/drawing selection toolbars
    if (isDrawingMode) {
      return;
    }

    // Track if user clicked an SVG drawing item after pressing Esc
    const clickedDrawing = target.closest('[data-draw-item="true"], [data-stroke="true"]') as SVGElement | null;
    if (clickedDrawing && notesAreaRef.current?.contains(clickedDrawing)) {
      e.preventDefault();
      e.stopPropagation();
      notesAreaRef.current.querySelectorAll('img.selected-note-image').forEach(el => {
        el.classList.remove('selected-note-image');
      });
      notesAreaRef.current.querySelectorAll('[data-selected-drawing="true"]').forEach(el => {
        if (el !== clickedDrawing) el.removeAttribute('data-selected-drawing');
      });
      clickedDrawing.setAttribute('data-selected-drawing', 'true');
      setSelectedImageEl(null);
      setSelectedDrawingEl(clickedDrawing);
      if (notesStageRef.current) {
        const stageRect = notesStageRef.current.getBoundingClientRect();
        const dRect = clickedDrawing.getBoundingClientRect();
        setSelectionBoxRect({
          top: Math.round(dRect.top - stageRect.top),
          left: Math.round(dRect.left - stageRect.left),
          width: Math.max(24, Math.round(dRect.width)),
          height: Math.max(24, Math.round(dRect.height))
        });
      }
      return;
    }

    // Track if user clicked an image inside #notes-area (Word-style movable & border-resizable image)
    const clickedImg = target.closest('img') as HTMLImageElement | null;
    if (clickedImg && notesAreaRef.current?.contains(clickedImg)) {
      notesAreaRef.current.querySelectorAll('[data-selected-drawing="true"]').forEach(el => {
        el.removeAttribute('data-selected-drawing');
      });
      notesAreaRef.current.querySelectorAll('img.selected-note-image').forEach(el => {
        if (el !== clickedImg) el.classList.remove('selected-note-image');
      });
      clickedImg.classList.add('selected-note-image');
      const layout = (clickedImg.getAttribute('data-layout') as ImageLayoutMode) || 'inline';
      const pinned = clickedImg.getAttribute('data-pinned') === 'true';
      const rawW = parseInt(clickedImg.getAttribute('data-width-pct') || '60', 10);
      setSelectedDrawingEl(null);
      setSelectedImageEl(clickedImg);
      setSelectedImageMeta({
        layout,
        pinned,
        widthPct: isNaN(rawW) ? 60 : rawW
      });
      if (notesStageRef.current) {
        const stageRect = notesStageRef.current.getBoundingClientRect();
        const iRect = clickedImg.getBoundingClientRect();
        setSelectionBoxRect({
          top: Math.round(iRect.top - stageRect.top),
          left: Math.round(iRect.left - stageRect.left),
          width: Math.max(24, Math.round(iRect.width)),
          height: Math.max(24, Math.round(iRect.height))
        });
      }
    } else {
      if (selectedImageEl) {
        notesAreaRef.current?.querySelectorAll('img.selected-note-image').forEach(el => {
          el.classList.remove('selected-note-image');
        });
        setSelectedImageEl(null);
      }
      if (selectedDrawingEl) {
        notesAreaRef.current?.querySelectorAll('[data-selected-drawing="true"]').forEach(el => {
          el.removeAttribute('data-selected-drawing');
        });
        setSelectedDrawingEl(null);
      }
      setSelectionBoxRect(null);
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
  // MOVABLE, BORDER-RESIZABLE IMAGES & POST-ESC INTERACTIVE DRAWINGS IN NOTES
  // ==========================================
  const syncSelectionBoxToElement = useCallback((el: Element | null) => {
    if (!el || !notesStageRef.current || !notesAreaRef.current?.contains(el)) {
      setSelectionBoxRect(null);
      return;
    }
    const stageRect = notesStageRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setSelectionBoxRect({
      top: Math.round(r.top - stageRect.top),
      left: Math.round(r.left - stageRect.left),
      width: Math.max(24, Math.round(r.width)),
      height: Math.max(24, Math.round(r.height))
    });
  }, []);

  const handleImageLayoutChange = (mode: ImageLayoutMode) => {
    const img =
      selectedImageEl && notesAreaRef.current?.contains(selectedImageEl)
        ? selectedImageEl
        : (notesAreaRef.current?.querySelector('img.selected-note-image') as HTMLImageElement | null);
    if (!img || !notesAreaRef.current) return;

    img.setAttribute('data-layout', mode);
    if (mode === 'front' || mode === 'behind') {
      const editorRect = notesAreaRef.current.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const relLeft = Math.max(12, Math.round(imgRect.left - editorRect.left + notesAreaRef.current.scrollLeft));
      const relTop = Math.max(12, Math.round(imgRect.top - editorRect.top + notesAreaRef.current.scrollTop));
      img.style.position = 'absolute';
      if (!img.style.left) img.style.left = `${relLeft}px`;
      if (!img.style.top) img.style.top = `${relTop}px`;
    } else {
      img.style.position = '';
      img.style.left = '';
      img.style.top = '';
    }
    setSelectedImageEl(img);
    setSelectedImageMeta(prev => ({ ...prev, layout: mode }));
    handleEditorInput();
    requestAnimationFrame(() => syncSelectionBoxToElement(img));
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
    const img =
      selectedImageEl && notesAreaRef.current?.contains(selectedImageEl)
        ? selectedImageEl
        : (notesAreaRef.current?.querySelector('img.selected-note-image') as HTMLImageElement | null);
    if (!img) return;
    const nextPinned = !selectedImageMeta.pinned;
    img.setAttribute('data-pinned', nextPinned ? 'true' : 'false');
    setSelectedImageMeta(prev => ({ ...prev, pinned: nextPinned }));
    handleEditorInput();
    showToast(
      nextPinned
        ? '📌 Foto ancorata e fissata nella posizione attuale!'
        : '🔓 Ancora sbloccata: puoi trascinare liberamente la foto negli appunti!'
    );
  };

  const handleImageWidthChange = (nextPct: number) => {
    const img =
      selectedImageEl && notesAreaRef.current?.contains(selectedImageEl)
        ? selectedImageEl
        : (notesAreaRef.current?.querySelector('img.selected-note-image') as HTMLImageElement | null);
    if (!img) return;
    const clamped = Math.max(15, Math.min(100, Math.round(nextPct)));
    img.setAttribute('data-width-pct', String(clamped));
    img.style.width = `${clamped}%`;
    img.style.height = 'auto';
    img.style.maxWidth = '100%';
    setSelectedImageMeta(prev => ({ ...prev, widthPct: clamped }));
    handleEditorInput();
    requestAnimationFrame(() => syncSelectionBoxToElement(img));
  };

  const handleDeleteSelectedImage = useCallback(() => {
    const img =
      selectedImageEl && notesAreaRef.current?.contains(selectedImageEl)
        ? selectedImageEl
        : (notesAreaRef.current?.querySelector('img.selected-note-image') as HTMLImageElement | null);
    if (img) {
      img.remove();
    } else if (selectedImageEl) {
      selectedImageEl.remove();
    }
    setSelectedImageEl(null);
    setSelectionBoxRect(null);
    handleEditorInput();
    showToast('🗑️ Immagine rimossa dagli appunti.');
  }, [selectedImageEl]);

  const handleDeleteSelectedDrawing = useCallback(() => {
    const drawEl =
      selectedDrawingEl && notesAreaRef.current?.contains(selectedDrawingEl)
        ? selectedDrawingEl
        : (notesAreaRef.current?.querySelector('[data-selected-drawing="true"]') as SVGElement | null);
    if (drawEl) {
      drawEl.remove();
    } else if (selectedDrawingEl) {
      selectedDrawingEl.remove();
    }
    setSelectedDrawingEl(null);
    setSelectionBoxRect(null);
    handleEditorInput();
    showToast('🗑️ Disegno rimosso dagli appunti.');
  }, [selectedDrawingEl]);

  const handleModifySelectedDrawingColor = (newColor: string) => {
    const drawEl =
      selectedDrawingEl && notesAreaRef.current?.contains(selectedDrawingEl)
        ? selectedDrawingEl
        : (notesAreaRef.current?.querySelector('[data-selected-drawing="true"]') as SVGElement | null);
    if (!drawEl) return;
    if (drawEl.tagName.toLowerCase() === 'circle') {
      drawEl.setAttribute('fill', newColor);
    } else {
      drawEl.setAttribute('stroke', newColor);
    }
    setDrawingColor(newColor);
    handleEditorInput();
  };

  const handleModifySelectedDrawingWidth = (newWidth: number) => {
    const drawEl =
      selectedDrawingEl && notesAreaRef.current?.contains(selectedDrawingEl)
        ? selectedDrawingEl
        : (notesAreaRef.current?.querySelector('[data-selected-drawing="true"]') as SVGElement | null);
    if (!drawEl) return;
    if (drawEl.tagName.toLowerCase() === 'circle') {
      drawEl.setAttribute('r', String(Math.max(2, newWidth / 2)));
    } else {
      drawEl.setAttribute('stroke-width', String(newWidth));
    }
    setDrawingWidth(newWidth);
    handleEditorInput();
    requestAnimationFrame(() => syncSelectionBoxToElement(drawEl));
  };

  // Start dragging one of the 8 border/corner resize handles on the selected Photo or Drawing
  const handleStartResizeObject = (
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notesAreaRef.current) return;

    const img =
      selectedImageEl && notesAreaRef.current.contains(selectedImageEl)
        ? selectedImageEl
        : (notesAreaRef.current.querySelector('img.selected-note-image') as HTMLImageElement | null);

    if (img) {
      const editorRect = notesAreaRef.current.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const origLeft =
        parseFloat(img.style.left) ||
        Math.max(0, Math.round(imgRect.left - editorRect.left + notesAreaRef.current.scrollLeft));
      const origTop =
        parseFloat(img.style.top) ||
        Math.max(0, Math.round(imgRect.top - editorRect.top + notesAreaRef.current.scrollTop));

      resizingObjectRef.current = {
        kind: 'image',
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origWidth: Math.max(40, imgRect.width),
        origHeight: Math.max(40, imgRect.height),
        origLeft,
        origTop,
        origTx: 0,
        origTy: 0,
        origSx: 1,
        origSy: 1
      };
      return;
    }

    const drawEl =
      selectedDrawingEl && notesAreaRef.current.contains(selectedDrawingEl)
        ? selectedDrawingEl
        : (notesAreaRef.current.querySelector('[data-selected-drawing="true"]') as SVGElement | null);

    if (drawEl) {
      const dRect = drawEl.getBoundingClientRect();
      const origTx = parseFloat(drawEl.getAttribute('data-tx') || '0') || 0;
      const origTy = parseFloat(drawEl.getAttribute('data-ty') || '0') || 0;
      const origSx = parseFloat(drawEl.getAttribute('data-sx') || '1') || 1;
      const origSy = parseFloat(drawEl.getAttribute('data-sy') || '1') || 1;
      resizingObjectRef.current = {
        kind: 'drawing',
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origWidth: Math.max(24, dRect.width),
        origHeight: Math.max(24, dRect.height),
        origLeft: 0,
        origTop: 0,
        origTx,
        origTy,
        origSx,
        origSy
      };
    }
  };

  // Global mousemove / mouseup listener for smooth border resizing & object dragging
  useEffect(() => {
    const onGlobalMouseMove = (e: MouseEvent) => {
      if (!notesAreaRef.current) return;

      // 1. Border / Corner Resize Handle Dragging
      if (resizingObjectRef.current) {
        const {
          kind,
          handle,
          startX,
          startY,
          origWidth,
          origHeight,
          origLeft,
          origTop,
          origTx,
          origTy,
          origSx,
          origSy
        } = resizingObjectRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (kind === 'image') {
          const img =
            selectedImageEl && notesAreaRef.current.contains(selectedImageEl)
              ? selectedImageEl
              : (notesAreaRef.current.querySelector('img.selected-note-image') as HTMLImageElement | null);
          if (!img) return;

          let nextW = origWidth;
          let nextH = origHeight;
          let nextLeft = origLeft;
          let nextTop = origTop;

          if (handle.includes('e')) nextW = Math.max(48, origWidth + dx);
          if (handle.includes('w')) {
            nextW = Math.max(48, origWidth - dx);
            nextLeft = Math.max(0, origLeft + (origWidth - nextW));
          }
          if (handle.includes('s')) nextH = Math.max(48, origHeight + dy);
          if (handle.includes('n')) {
            nextH = Math.max(48, origHeight - dy);
            nextTop = Math.max(0, origTop + (origHeight - nextH));
          }

          // Corner handles preserve aspect ratio unless Shift is held
          if ((handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se') && !e.shiftKey) {
            const ratio = origHeight / Math.max(1, origWidth);
            nextH = Math.max(48, Math.round(nextW * ratio));
            if (handle.includes('n')) {
              nextTop = Math.max(0, origTop + (origHeight - nextH));
            }
          }

          img.style.width = `${Math.round(nextW)}px`;
          img.style.height = `${Math.round(nextH)}px`;
          img.style.maxWidth = 'none';

          const layout = (img.getAttribute('data-layout') as ImageLayoutMode) || 'inline';
          if (layout === 'front' || layout === 'behind') {
            img.style.left = `${Math.round(nextLeft)}px`;
            img.style.top = `${Math.round(nextTop)}px`;
          }
          const editorW = Math.max(1, notesAreaRef.current.clientWidth);
          const pct = Math.min(100, Math.max(10, Math.round((nextW / editorW) * 100)));
          img.setAttribute('data-width-pct', String(pct));
          setSelectedImageMeta(prev => ({ ...prev, widthPct: pct }));
          syncSelectionBoxToElement(img);
          return;
        }

        if (kind === 'drawing') {
          const drawEl =
            selectedDrawingEl && notesAreaRef.current.contains(selectedDrawingEl)
              ? selectedDrawingEl
              : (notesAreaRef.current.querySelector('[data-selected-drawing="true"]') as SVGElement | null);
          if (!drawEl) return;

          const scaleDeltaX = handle.includes('w') ? -dx / origWidth : handle.includes('e') ? dx / origWidth : 0;
          const scaleDeltaY = handle.includes('n') ? -dy / origHeight : handle.includes('s') ? dy / origHeight : 0;
          const nextSx = Math.max(0.25, Math.min(5, Number((origSx * (1 + scaleDeltaX)).toFixed(3))));
          const nextSy = Math.max(0.25, Math.min(5, Number((origSy * (1 + (scaleDeltaY || scaleDeltaX))).toFixed(3))));

          drawEl.setAttribute('data-sx', String(nextSx));
          drawEl.setAttribute('data-sy', String(nextSy));
          drawEl.setAttribute('transform', `translate(${origTx}, ${origTy}) scale(${nextSx}, ${nextSy})`);
          drawEl.style.transformOrigin = 'center center';
          drawEl.style.transformBox = 'fill-box';
          syncSelectionBoxToElement(drawEl);
          return;
        }
      }

      // 2. Post-Esc Drawing Dragging
      if (draggingDrawingRef.current) {
        const { el, startX, startY, origTx, origTy, origSx, origSy } = draggingDrawingRef.current;
        const nextTx = Math.round(origTx + (e.clientX - startX));
        const nextTy = Math.round(origTy + (e.clientY - startY));
        el.setAttribute('data-tx', String(nextTx));
        el.setAttribute('data-ty', String(nextTy));
        el.setAttribute('transform', `translate(${nextTx}, ${nextTy}) scale(${origSx}, ${origSy})`);
        el.style.transformOrigin = 'center center';
        el.style.transformBox = 'fill-box';
        syncSelectionBoxToElement(el);
      }
    };

    const onGlobalMouseUp = () => {
      if (resizingObjectRef.current) {
        resizingObjectRef.current = null;
        handleEditorInput();
      }
      if (draggingDrawingRef.current) {
        draggingDrawingRef.current = null;
        handleEditorInput();
      }
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [selectedImageEl, selectedDrawingEl, syncSelectionBoxToElement]);

  // Dragging unpinned images or drawings inside #notes-area
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
        const hitDrawItem = target.closest('[data-draw-item="true"], [data-stroke="true"]');
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

    // 2. If clicking a drawn SVG stroke/shape when NOT in drawing mode (after Esc), allow dragging it freely
    const drawEl = target.closest('[data-draw-item="true"], [data-stroke="true"]') as SVGElement | null;
    if (drawEl && notesAreaRef.current.contains(drawEl)) {
      e.preventDefault();
      e.stopPropagation();
      notesAreaRef.current.querySelectorAll('[data-selected-drawing="true"]').forEach(el => {
        if (el !== drawEl) el.removeAttribute('data-selected-drawing');
      });
      drawEl.setAttribute('data-selected-drawing', 'true');
      setSelectedImageEl(null);
      setSelectedDrawingEl(drawEl);
      syncSelectionBoxToElement(drawEl);

      const origTx = parseFloat(drawEl.getAttribute('data-tx') || '0') || 0;
      const origTy = parseFloat(drawEl.getAttribute('data-ty') || '0') || 0;
      const origSx = parseFloat(drawEl.getAttribute('data-sx') || '1') || 1;
      const origSy = parseFloat(drawEl.getAttribute('data-sy') || '1') || 1;
      draggingDrawingRef.current = {
        el: drawEl,
        startX: e.clientX,
        startY: e.clientY,
        origTx,
        origTy,
        origSx,
        origSy
      };
      return;
    }

    // 3. If clicking an image that is NOT pinned, allow dragging it freely anywhere in #notes-area
    const imgEl = target.closest('img') as HTMLImageElement | null;
    if (imgEl && notesAreaRef.current.contains(imgEl)) {
      const isPinned = imgEl.getAttribute('data-pinned') === 'true';
      if (!isPinned) {
        e.preventDefault();
        const editorRect = notesAreaRef.current.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        const origLeft =
          parseFloat(imgEl.style.left) ||
          Math.max(0, Math.round(imgRect.left - editorRect.left + notesAreaRef.current.scrollLeft));
        const origTop =
          parseFloat(imgEl.style.top) ||
          Math.max(0, Math.round(imgRect.top - editorRect.top + notesAreaRef.current.scrollTop));

        draggingImageRef.current = {
          img: imgEl,
          startX: e.clientX,
          startY: e.clientY,
          origLeft,
          origTop,
          hasMoved: false
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

    // 2. Live Image Drag update (auto-promotes to free movement once dragged > 4px)
    if (draggingImageRef.current) {
      const { img, startX, startY, origLeft, origTop, hasMoved } = draggingImageRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved && Math.hypot(dx, dy) < 4) return;

      if (!hasMoved) {
        draggingImageRef.current.hasMoved = true;
        const layout = (img.getAttribute('data-layout') as ImageLayoutMode) || 'inline';
        if (layout !== 'front' && layout !== 'behind') {
          img.setAttribute('data-layout', 'front');
          img.style.position = 'absolute';
          setSelectedImageMeta(prev => ({ ...prev, layout: 'front' }));
        }
      }
      const nextLeft = Math.max(0, Math.round(origLeft + dx));
      const nextTop = Math.max(0, Math.round(origTop + dy));
      img.style.left = `${nextLeft}px`;
      img.style.top = `${nextTop}px`;
      syncSelectionBoxToElement(img);
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
      const moved = draggingImageRef.current.hasMoved;
      draggingImageRef.current = null;
      if (moved) {
        handleEditorInput();
      }
    }
  };

  const handleUndoLastDrawing = () => {
    if (!notesAreaRef.current) return;
    const svg = notesAreaRef.current.querySelector('svg.note-drawing-svg');
    const items = svg?.querySelectorAll('[data-draw-item="true"], [data-stroke="true"]');
    if (items && items.length > 0) {
      items[items.length - 1].remove();
      setSelectedDrawingEl(null);
      setSelectionBoxRect(null);
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
      setSelectedDrawingEl(null);
      setSelectionBoxRect(null);
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
          const starterSnippets: Record<string, string> = {
            javascript: 'for (let i = 0; i < 10; i++) {\n    console.log(i);\n}',
            python: 'for i in range(5):\n    print("Valore:", i)',
            sql: "CREATE TABLE IF NOT EXISTS studenti (\n    id INT PRIMARY KEY AUTOINCREMENT,\n    nome VARCHAR(50),\n    corso VARCHAR(50),\n    voto INT\n);\nINSERT INTO studenti (nome, corso, voto) VALUES ('Marco Rossi', 'Cloud & DevOps', 29), ('Giulia Bianchi', 'Database SQL', 30);\nSELECT * FROM studenti ORDER BY voto DESC;",
            html: '<div style="padding:12px;background:#1e293b;color:#38bdf8;border-radius:8px;font-family:sans-serif;">\n  <h3 style="margin:0 0 6px 0;">Anteprima Live HTML</h3>\n  <p style="margin:0;color:#e2e8f0;">Modifica questo blocco e premi Esegui!</p>\n</div>',
            json: '{\n  "progetto": "Workspace ITS",\n  "versione": "2.7.0",\n  "attivo": true\n}',
            cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    for (int i = 0; i < 5; i++) {\n        cout << "Iterazione: " << i << endl;\n    }\n    return 0;\n}',
            java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Ciao da Java!");\n    }\n}',
            php: '<?php\nfor ($i = 1; $i <= 3; $i++) {\n    echo "Riga $i\\n";\n}\n?>',
            bash: 'echo " Workspace ITS Shell"\nuname -a'
          };
          let rawCode = codeEl.textContent || '';
          const trimmed = rawCode.trim();
          const isDefaultStarter =
            !trimmed ||
            Object.values(starterSnippets).some(s => s.trim() === trimmed) ||
            trimmed === '// Scrivi il tuo codice qui...';
          if (isDefaultStarter && starterSnippets[newLang]) {
            rawCode = starterSnippets[newLang];
          }
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

  // Attach native 'change' listener to #notes-area so dynamically injected <select class="note-code-lang-select"> elements always trigger handleNotesAreaChange
  useEffect(() => {
    const el = notesAreaRef.current;
    if (!el) return;
    const onNativeChange = (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (t && t.classList.contains('note-code-lang-select')) {
        handleNotesAreaChange({ target: t } as unknown as React.FormEvent<HTMLDivElement>);
      }
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  });

  // Handle live syntax re-highlighting in .note-code-pre and live formula evaluation in .note-formula-input on input
  const handleNotesAreaInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && target.classList.contains('note-code-lang-select')) {
      handleNotesAreaChange(e);
      return;
    }
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
    // If clipboard contains plain text (e.g. user copied a sentence), paste the text normally!
    const plainText = e.clipboardData?.getData('text/plain') || '';
    if (plainText.trim().length > 0) {
      return;
    }

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
          const imgHtml = `<img src="${compressed.dataUrl}" alt="Screenshot Appunti" class="note-pasted-screenshot" data-layout="inline" style="width: 60%; max-width: 100%;" /><p><br></p>`;
          insertHtmlAtEditorCursor(imgHtml);
          showToast('📸 Foto incollata! Cliccala per spostarla liberamente, ridimensionarla dai bordi o eliminarla.');
        } catch (err) {
          console.error('Screenshot paste error:', err);
          showToast("Errore durante l'incollaggio dello screenshot.", 'error');
        }
        return;
      }
    }
  };

  // Paste Screenshot / Image directly into AI Chat (#user-chat-input / .ai-chat-panel)
  const handleChatPaste = async (e: React.ClipboardEvent<HTMLElement>) => {
    e.stopPropagation();

    // If the user copied a text phrase, let the browser paste the text into the input!
    const plainText = e.clipboardData?.getData('text/plain') || '';
    if (plainText.trim().length > 0) {
      return;
    }

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
          const timeStamp = new Date()
            .toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
            .replace(/:/g, '-');
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
          showToast("Errore nell'allegare lo screenshot alla chat.", 'error');
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
        if (selectedImageEl) {
          notesAreaRef.current?.querySelectorAll('img.selected-note-image').forEach(el => {
            el.classList.remove('selected-note-image');
          });
          setSelectedImageEl(null);
          setSelectionBoxRect(null);
        }
        if (selectedDrawingEl) {
          notesAreaRef.current?.querySelectorAll('[data-selected-drawing="true"]').forEach(el => {
            el.removeAttribute('data-selected-drawing');
          });
          setSelectedDrawingEl(null);
          setSelectionBoxRect(null);
        }
        return;
      }

      // Delete or Backspace while a Photo or Post-Esc Drawing is selected deletes it immediately
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedImageEl || selectedDrawingEl)) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          e.preventDefault();
          e.stopPropagation();
          if (selectedImageEl) {
            handleDeleteSelectedImage();
          } else if (selectedDrawingEl) {
            handleDeleteSelectedDrawing();
          }
          return;
        }
      }

      if (!currentUser || !isApproved) return;

      // Global Command Palette Shortcut (Ctrl+K / Cmd+K)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

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
    selectedImageEl,
    selectedDrawingEl,
    handleDeleteSelectedImage,
    handleDeleteSelectedDrawing,
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
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const result = await signInWithPopup(calendarAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setGoogleOAuthAccessToken(token);
        if (result.user?.email) {
          setGoogleCalendarEmail(result.user.email);
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

  // Gemini AI Chat Execution with Keys Auto-Rotation, Calendar Commands & Document Grounding
  const handleSendAIChat = async (customPrompt: string | null = null, isAnalysis: boolean = false) => {
    const userText = customPrompt || chatInput.trim();
    if (!userText && !attachedFile && !chatSelectedMaterial) return;

    // 1. Check if the user asked in chat to add a Calendar Reminder / Exam / Lesson / Event
    // Works immediately even without a Gemini API Key!
    if (!customPrompt && !isAnalysis && !attachedFile && userText) {
      const subjectNames = subjects.map(s => s.name);
      const calCmd = parseCalendarChatCommand(userText, subjectNames);
      if (calCmd && calCmd.isAddCommand) {
        setChatInput('');
        const evToCreate = {
          title: calCmd.title,
          date: calCmd.date,
          startTime: calCmd.startTime,
          endTime: calCmd.endTime,
          category: calCmd.category,
          subject: calCmd.subject || activeSubject || 'Generale',
          description: calCmd.description,
          completed: false
        };

        await handleAddCalendarEvent(evToCreate, Boolean(googleOAuthAccessToken));
        const catMeta = CATEGORY_META[evToCreate.category] || CATEGORY_META.study;
        const aiConfirmText =
          `✅ **Promemoria aggiunto al Calendario!**\n\n` +
          `• **Impegno:** ${catMeta.icon} ${evToCreate.title}\n` +
          `• **Data:** ${calCmd.readableDateIt} (${evToCreate.date}, ${evToCreate.startTime} - ${evToCreate.endTime})\n` +
          `• **Materia:** ${evToCreate.subject}\n` +
          `• **Categoria:** ${catMeta.label}\n\n` +
          `Lo trovi subito nella scheda **📅 Calendario** (viste *Giorno*, *Settimana*, *Mese* e *Agenda*)${googleOAuthAccessToken ? ' ed è stato sincronizzato anche sul tuo **Google Calendar Personale**!' : '.'}`;

        if (workspaceMode === 'shared' && activeRoomId) {
          await WorkspaceService.sendRoomMessage(activeRoomId, {
            id: 'msg_' + Date.now(),
            role: 'user',
            senderId: currentUser?.uid || 'anon',
            senderName: currentUser?.displayName || 'Studente',
            senderPhoto: currentUser?.photoURL || '',
            parts: [{ text: userText }],
            rawText: userText,
            timestamp: Date.now()
          });
          await WorkspaceService.sendRoomMessage(activeRoomId, {
            id: 'ai_' + (Date.now() + 1),
            role: 'model',
            senderId: 'gemini',
            senderName: 'Calendario AI ✦',
            parts: [{ text: aiConfirmText }],
            rawText: aiConfirmText,
            timestamp: Date.now() + 1
          });
        } else {
          const userMsg: ChatMessage = {
            role: 'user',
            parts: [{ text: userText }],
            rawText: userText,
            timestamp: Date.now()
          };
          const aiMsg: ChatMessage = {
            role: 'model',
            parts: [{ text: aiConfirmText }],
            rawText: aiConfirmText,
            timestamp: Date.now() + 1
          };
          const updatedList = [...(chats[activeSubject] || []), userMsg, aiMsg];
          setChats(prev => {
            const next = { ...prev, [activeSubject]: updatedList };
            WorkspaceService.saveLocalChats(next);
            return next;
          });
          if (currentUser) {
            WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, updatedList).catch(() => {});
          }
        }
        return;
      }
    }

    // 2. If user asks about their schedule/subjects ("che materie ho domani?", "che impegni ho oggi?") and has no API key configured,
    // answer directly from the local/cloud calendar!
    if (apiKeys.length === 0 && !customPrompt && !isAnalysis && userText) {
      const localCalReply = answerCalendarQueryLocally(userText, calendarEvents);
      if (localCalReply.isCalendarQuery && localCalReply.replyMarkdown) {
        setChatInput('');
        const userMsg: ChatMessage = {
          role: 'user',
          parts: [{ text: userText }],
          rawText: userText,
          timestamp: Date.now()
        };
        const aiMsg: ChatMessage = {
          role: 'model',
          parts: [{ text: localCalReply.replyMarkdown }],
          rawText: localCalReply.replyMarkdown,
          timestamp: Date.now() + 1
        };
        const updatedList = [...(chats[activeSubject] || []), userMsg, aiMsg];
        setChats(prev => {
          const next = { ...prev, [activeSubject]: updatedList };
          WorkspaceService.saveLocalChats(next);
          return next;
        });
        return;
      }
    }

    if (apiKeys.length === 0) {
      showToast('Nessuna API Key salvata! Aggiungi almeno una chiave per Gemini.', 'error');
      handleOpenKeysModal();
      return;
    }

    // Check if the user asked in chat to directly highlight or edit the notes (including targeted Code Box, Formula Box, or Quote Box edits!)
    if (!customPrompt && !isAnalysis && !attachedFile && userText) {
      const editIntent = parseAiNoteEditIntent(userText);
      if (editIntent.isDirectNoteEdit && editIntent.mode !== 'none') {
        setChatInput('');
        await handleAiHighlightOrEditNotes({
          mode: editIntent.mode,
          instruction: userText,
          targetTopic: editIntent.targetTopic
        });
        return;
      }
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

    // 1. Transient manual attached image/file (clear immediately once consumed so next message doesn't resend it)
    if (attachedFile) {
      userParts.push({
        inlineData: {
          mimeType: attachedFile.mimeType,
          data: attachedFile.data
        }
      });
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

    // Build Calendar & Subjects Context so Gemini Copilot can answer "che materie ho domani?", "quali esami ho questa settimana?", etc.
    const calendarContextBlock = buildCalendarScheduleContextForChat(calendarEvents);
    const allSubjectsLine = `Materie del corso dell'utente: ${subjects.map(s => s.name).join(', ')}.`;

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
      let systemContext = `Sei l'assistente AI ITS del gruppo di studio "${currentRoom?.name || 'Stanza ITS'}". Rispondi in italiano in modo chiaro, utile e accademico.\n${allSubjectsLine}\n\n${calendarContextBlock}`;
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

      try {
        const aiText = await callGeminiWithRotation(
          orderedKeys,
          normalizeGeminiModelName(selectedModel),
          systemContext,
          promptContents
        );
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

        await WorkspaceService.sendRoomMessage(activeRoomId, sharedAiMsg);
        setAttachedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        const lastErrorMessage = err?.message || 'Impossibile completare la richiesta AI.';
        const errorMsgId = 'err_' + Date.now();
        await WorkspaceService.sendRoomMessage(activeRoomId, {
          id: errorMsgId,
          role: 'model',
          senderId: 'system',
          senderName: 'Avviso di Sistema',
          parts: [{ text: `⚠️ **Attenzione:** ${lastErrorMessage}` }],
          rawText: lastErrorMessage,
          timestamp: Date.now()
        });
      } finally {
        setIsAILoading(false);
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
      ? `Sei un assistente ITS per "${activeSubject}".\n${allSubjectsLine}\n\n${calendarContextBlock}\n\nAppunti della lezione:\n\n${noteText}`
      : `Sei un assistente ITS per "${activeSubject}".\n${allSubjectsLine}\n\n${calendarContextBlock}`;

    if (chatSelectedMaterial) {
      systemContext += `\n\n[FONTE COLLEGATA DALL'UTENTE]: "${chatSelectedMaterial.name}" (${chatSelectedMaterial.category}). Rispondi in modo esaustivo facendo riferimento e spiegando accuratamente i contenuti di questo materiale.`;
    }

    try {
      const aiText = await callGeminiWithRotation(
        orderedKeys,
        normalizeGeminiModelName(selectedModel),
        systemContext,
        nextChats.map(m => ({
          role: m.role === 'ai' ? 'model' : m.role,
          parts: m.parts
        }))
      );
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

      if (currentUser) {
        WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, finalChatList).catch(err => {
          console.warn('Background chat cloud sync error:', err);
        });
      }
    } catch (err: any) {
      const lastErrorMessage = err?.message || 'Impossibile completare la richiesta. Verificare le API keys.';
      const errorAIMsg: ChatMessage = {
        role: 'model',
        parts: [{ text: `⚠️ **Attenzione:** ${lastErrorMessage}` }],
        rawText: lastErrorMessage,
        timestamp: Date.now()
      };
      setChats(prev => ({
        ...prev,
        [activeSubject]: [...nextChats, errorAIMsg]
      }));
    } finally {
      setIsAILoading(false);
    }
  };

  // Direct AI Highlighting & In-Place Note Editing (Whole note, Specific Topic, Code Box, Formula Box, Quote Box, or Right-Click Selection)
  const handleAiHighlightOrEditNotes = async (options: {
    mode: 'highlight' | 'edit' | 'edit_code_box' | 'edit_formula_box' | 'edit_quote_box';
    instruction: string;
    targetTopic?: string | null;
    onlySelection?: boolean;
    savedRange?: Range | null;
  }) => {
    if (!notesAreaRef.current) return;
    if (apiKeys.length === 0) {
      showToast('Aggiungi almeno una chiave API Gemini per usare le funzioni AI sugli appunti.', 'error');
      handleOpenKeysModal();
      return;
    }

    const orderedKeys: string[] = [];
    if (apiKeys[selectedKeyIndex]) orderedKeys.push(apiKeys[selectedKeyIndex]);
    apiKeys.forEach((k, idx) => {
      if (idx !== selectedKeyIndex && k.trim()) orderedKeys.push(k.trim());
    });

    const currentFullHtml = notesAreaRef.current.innerHTML;
    if (!currentFullHtml.trim()) {
      showToast('Gli appunti sono vuoti! Scrivi prima qualcosa.', 'error');
      return;
    }

    // Save Undo snapshot before AI modifies the note
    setAiUndoHtmlSnapshot(currentFullHtml);
    setIsAILoading(true);

    try {
      // Case A: Right-click Selection-only highlight or in-place rewrite
      if (options.onlySelection && options.savedRange) {
        const range = options.savedRange;
        const fragment = range.cloneContents();
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);
        const selectedHtml = tempDiv.innerHTML || range.toString();

        const sysPrompt =
          options.mode === 'highlight'
            ? `Sei un assistente didattico ITS. Riceverai un frammento HTML selezionato dagli appunti dello studente.
Evidenzia SOLO i concetti chiave, le definizioni importanti e le parole fondamentali avvolgendole con:
<mark style="background: rgba(250, 204, 21, 0.38); color: #fef08a; padding: 1px 4px; border-radius: 4px;">...</mark>
REGOLE TASSATIVE:
1. NON cancellare e NON riassumere il testo: mantieni il 100% delle frasi e dei tag originali.
2. Restituisci SOLO il codice HTML aggiornato, senza blocchi markdown (\`\`\`html).`
            : `Sei un assistente didattico ITS. Migliora la forma, la chiarezza e la formattazione HTML del frammento selezionato mantenendo tutti i concetti tecnici. Restituisci SOLO l'HTML aggiornato senza blocchi markdown (\`\`\`html).`;

        const rawOut = await callGeminiWithRotation(
          orderedKeys,
          normalizeGeminiModelName(selectedModel),
          sysPrompt,
          [{ role: 'user', parts: [{ text: selectedHtml }] }]
        );
        const cleanedHtml = rawOut
          .replace(/^```(?:html)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        if (cleanedHtml) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand('insertHTML', false, cleanedHtml);
          handleEditorInput();
          showToast(
            options.mode === 'highlight'
              ? '🖍️ Concetti chiave evidenziati nella selezione!'
              : '🪄 Selezione migliorata e sostituita sul posto!'
          );
        }
        return;
      }

      // Case B: Targeted In-Place Edit inside a Code Box, Formula Box, or Quote Box!
      if (
        options.mode === 'edit_code_box' ||
        options.mode === 'edit_formula_box' ||
        options.mode === 'edit_quote_box'
      ) {
        const boxType =
          options.mode === 'edit_code_box'
            ? 'code'
            : options.mode === 'edit_formula_box'
            ? 'formula'
            : 'quote';

        // Collect all existing boxes of this type from the DOM
        const codeEls = Array.from(notesAreaRef.current.querySelectorAll('.note-code-block'));
        const formulaEls = Array.from(notesAreaRef.current.querySelectorAll('.note-formula-box'));
        const quoteEls = Array.from(notesAreaRef.current.querySelectorAll('blockquote'));

        const boxesSummary: string[] = [];
        if (boxType === 'code') {
          codeEls.forEach((el, idx) => {
            const id = el.getAttribute('id') || `code_${idx}`;
            const lang = el.getAttribute('data-lang') || 'javascript';
            let raw = '';
            try {
              raw = decodeURIComponent(el.getAttribute('data-raw') || '');
            } catch {
              raw = el.querySelector('.note-code-content')?.textContent || '';
            }
            boxesSummary.push(`BLOCCO CODICE #${idx + 1} [id="${id}", lang="${lang}"]:\n${raw}`);
          });
        } else if (boxType === 'formula') {
          formulaEls.forEach((el, idx) => {
            const id = el.getAttribute('id') || `formula_${idx}`;
            const expr = el.getAttribute('data-formula') || el.querySelector('.note-formula-input')?.textContent || '';
            boxesSummary.push(`BOX FORMULA #${idx + 1} [id="${id}"]: ${expr}`);
          });
        } else {
          quoteEls.forEach((el, idx) => {
            boxesSummary.push(`CITAZIONE #${idx + 1}: ${el.innerHTML}`);
          });
        }

        showToast(
          boxType === 'code'
            ? '💻 Correzione e sostituzione nella Box Codice in corso...'
            : boxType === 'formula'
            ? '∑ Correzione e sostituzione nella Box Formula in corso...'
            : '💬 Correzione e sostituzione nella Citazione in corso...'
        );

        const sysPrompt = `Sei l'assistente tecnico ITS che modifica direttamente i blocchi interattivi negli appunti dello studente.
Richiesta dello studente: "${options.instruction}"

Elenco dei blocchi attualmente presenti negli appunti:
${boxesSummary.length > 0 ? boxesSummary.join('\n\n---\n\n') : '(Nessun blocco di questo tipo ancora presente negli appunti)'}

REGOLE TASSATIVE:
1. Individua il blocco a cui si riferisce lo studente (es. quello che contiene il ciclo/funzione/formula/citazione citata come "${options.targetTopic || ''}").
2. Se lo studente chiede di sistemare/correggere/sostituire SOLO UNA PARTE del blocco (es. solo il ciclo per calcolare Fibonacci dentro un blocco più grande), MANTIENI INTATTO tutto il resto del codice/testo del blocco e sostituisci al suo interno solo la parte richiesta, restituendo il contenuto completo aggiornato del blocco in "newContent".
3. Restituisci ESCLUSIVAMENTE un oggetto JSON valido (senza \`\`\`json) con questa struttura esatta:
{
  "targetBlockId": "id_del_blocco_scelto_oppure_vuoto",
  "newLang": "javascript | python | sql | bash | cpp | java | html | php | json",
  "newContent": "codice_o_formula_o_citazione_aggiornata_da_mettere_nella_box",
  "summary": "Breve conferma in italiano di cosa hai sistemato e sostituito nella box"
}`;

        const rawJsonOut = await callGeminiWithRotation(
          orderedKeys,
          normalizeGeminiModelName(selectedModel),
          sysPrompt,
          [{ role: 'user', parts: [{ text: options.instruction }] }]
        );

        let targetBlockId = '';
        let newLang = '';
        let newContent = '';
        let summaryText = '';

        try {
          const cleanedJson = rawJsonOut
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          const parsed = JSON.parse(cleanedJson);
          targetBlockId = parsed.targetBlockId || '';
          newLang = parsed.newLang || '';
          newContent = parsed.newContent || '';
          summaryText = parsed.summary || '';
        } catch {
          // Fallback if model returned fenced code instead of JSON
          const fenceMatch = rawJsonOut.match(/```([a-zA-Z0-9_+#-]*)\n([\s\S]*?)```/);
          if (fenceMatch) {
            newLang = fenceMatch[1] || '';
            newContent = fenceMatch[2].trim();
          } else {
            newContent = rawJsonOut.trim();
          }
        }

        if (newContent && notesAreaRef.current) {
          const rep = applyTargetedBoxReplacement(notesAreaRef.current.innerHTML, {
            boxType,
            targetBlockId,
            targetTopic: options.targetTopic,
            newContent,
            newLang
          });

          if (rep.matched) {
            notesAreaRef.current.innerHTML = rep.updatedHtml;
          } else {
            // If no box existed yet, insert a brand new interactive box at the end of the notes!
            const newBoxHtml =
              boxType === 'code'
                ? buildHighlightedCodeBlockHtml(newContent, normalizeCodeLanguageId(newLang))
                : boxType === 'formula'
                ? `<p>${buildInteractiveFormulaBoxHtml(newContent)}</p>`
                : `<blockquote class="note-quote-block">${newContent}</blockquote><p><br></p>`;
            notesAreaRef.current.innerHTML += (notesAreaRef.current.innerHTML ? '<br>' : '') + newBoxHtml;
          }

          handleEditorInput();
          setActiveTab('notes');

          const confirmText =
            summaryText ||
            (boxType === 'code'
              ? `💻 Ho sistemato e sostituito il codice direttamente nella **Box Codice** degli appunti! *(Puoi premere "▶ Esegui" nella box o "↩️ Annulla Modifica AI" se vuoi ripristinare).*`
              : boxType === 'formula'
              ? `∑ Ho aggiornato e ricalcolato la **Box Formula** direttamente negli appunti!`
              : `💬 Ho aggiornato la **Citazione** direttamente negli appunti!`);

          const userChatMsg: ChatMessage = {
            role: 'user',
            parts: [{ text: options.instruction }],
            rawText: options.instruction,
            timestamp: Date.now()
          };
          const aiChatMsg: ChatMessage = {
            role: 'model',
            parts: [{ text: confirmText }],
            rawText: confirmText,
            timestamp: Date.now() + 1
          };
          setChats(prev => {
            const nextSubChats = [...(prev[activeSubject] || []), userChatMsg, aiChatMsg];
            const updated = { ...prev, [activeSubject]: nextSubChats };
            WorkspaceService.saveLocalChats(updated);
            if (currentUser) {
              WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, nextSubChats).catch(() => {});
            }
            return updated;
          });
          showToast('✨ Box aggiornata direttamente negli appunti!');
        }
        return;
      }

      // Case C: Full Note or Specific Topic Section Highlight/Edit from Chat or Button
      const topicClause = options.targetTopic
        ? `ATTENZIONE — FOCUS SU SEZIONE SPECIFICA: Lo studente ha chiesto di intervenire SOLO sulla parte dove si parla di: "${options.targetTopic}". Individua i paragrafi o le sezioni che trattano "${options.targetTopic}" e applica le evidenziazioni <mark> SOLO in quella parte, lasciando invariato tutto il resto della pagina!`
        : `Applica l'intervento sui concetti chiave più importanti di tutta la nota.`;

      const sysPrompt =
        options.mode === 'highlight'
          ? `Sei un assistente didattico ITS che modifica direttamente il foglio HTML degli appunti dello studente.
Richiesta dello studente: "${options.instruction}"
${topicClause}
REGOLE TASSATIVE:
1. Usa <mark style="background: rgba(250, 204, 21, 0.38); color: #fef08a; padding: 1px 4px; border-radius: 4px;">concetto chiave</mark> per evidenziare le frasi, parole chiave, comandi o definizioni più importanti.
2. MANTIENI INTATTI tutti i blocchi codice (<div class="note-code-block">...</div>), le formule (<span class="note-formula-box">...</span>), le tabelle (<div class="note-table-wrapper">...</div>), le immagini (<img>) e i disegni (<svg>). Non rimuovere mai nulla!
3. Restituisci ESCLUSIVAMENTE l'HTML completo aggiornato della nota, senza \`\`\`html e senza commenti.`
          : `Sei un assistente didattico ITS che modifica direttamente il foglio HTML degli appunti dello studente.
Richiesta dello studente: "${options.instruction}"
${topicClause}
REGOLE TASSATIVE:
1. Applica la modifica richiesta direttamente sull'HTML mantenendo intatti tutti i blocchi codice (<div class="note-code-block">...</div>), formule, tabelle, immagini e disegni SVG.
2. Puoi usare <mark style="background: rgba(250, 204, 21, 0.38); color: #fef08a; padding: 1px 4px; border-radius: 4px;">...</mark> e <b>...</b> per mettere in risalto i punti chiave.
3. Restituisci ESCLUSIVAMENTE l'HTML completo aggiornato della nota, senza \`\`\`html.`;

      showToast(
        options.targetTopic
          ? `🖍️ Evidenziazione AI in corso sulla sezione "${options.targetTopic}"...`
          : '🖍️ Evidenziazione concetti chiave AI negli appunti in corso...'
      );

      const rawOut = await callGeminiWithRotation(
        orderedKeys,
        normalizeGeminiModelName(selectedModel),
        sysPrompt,
        [{ role: 'user', parts: [{ text: currentFullHtml }] }]
      );

      const cleanedHtml = rawOut
        .replace(/^```(?:html)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      if (cleanedHtml && notesAreaRef.current) {
        notesAreaRef.current.innerHTML = sanitizeAndUpgradeNoteHtml(cleanedHtml).cleanedHtml;
        handleEditorInput();
        setActiveTab('notes');

        const confirmText = options.targetTopic
          ? `🖍️ Ho evidenziato direttamente negli appunti i concetti chiave relativi a **"${options.targetTopic}"**! *(Puoi premere "↩️ Annulla Modifica AI" sopra gli appunti se vuoi ripristinare).*`
          : `🖍️ Ho evidenziato direttamente nei tuoi appunti i **concetti chiave**! *(Puoi premere "↩️ Annulla Modifica AI" sopra gli appunti in qualsiasi momento).*`;

        const userChatMsg: ChatMessage = {
          role: 'user',
          parts: [{ text: options.instruction }],
          rawText: options.instruction,
          timestamp: Date.now()
        };
        const aiChatMsg: ChatMessage = {
          role: 'model',
          parts: [{ text: confirmText }],
          rawText: confirmText,
          timestamp: Date.now()
        };
        setChats(prev => {
          const nextSubChats = [...(prev[activeSubject] || []), userChatMsg, aiChatMsg];
          const updated = { ...prev, [activeSubject]: nextSubChats };
          WorkspaceService.saveLocalChats(updated);
          if (currentUser) {
            WorkspaceService.saveChatToCloud(currentUser.uid, activeSubject, nextSubChats).catch(() => {});
          }
          return updated;
        });
        showToast('✨ Appunti evidenziati dall\'AI! (Annullabile in 1 click)');
      }
    } catch (err: any) {
      showToast(`Errore modifica AI sugli appunti: ${err.message || 'Riprova'}`, 'error');
    } finally {
      setIsAILoading(false);
    }
  };

  const handleUndoAiNoteEdit = () => {
    if (!aiUndoHtmlSnapshot || !notesAreaRef.current) return;
    notesAreaRef.current.innerHTML = aiUndoHtmlSnapshot;
    setAiUndoHtmlSnapshot(null);
    handleEditorInput();
    showToast('↩️ Modifica AI annullata: appunti ripristinati!');
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

  // Insert any AI Markdown Response into Active Note (automatically converting ```code```, $$formula$$, and > quotes into interactive boxes!)
  const handleInsertAiMessageToNotes = (markdownText: string) => {
    if (!markdownText || !markdownText.trim()) {
      showToast('Nessun contenuto AI da aggiungere.', 'error');
      return;
    }
    setActiveTab('notes');
    if (notesAreaRef.current) {
      setAiUndoHtmlSnapshot(notesAreaRef.current.innerHTML);
      const richHtml = convertAiMarkdownToNoteHtml(markdownText, md => marked.parse(md) as string);
      notesAreaRef.current.innerHTML += (notesAreaRef.current.innerHTML ? '<br>' : '') + richHtml;
      handleEditorInput();
      showToast('✨ Contenuto AI aggiunto agli appunti con Box Codice / Formule / Citazioni interattive!');
    }
  };

  // Append Last AI Response to Active Note
  const handleAppendLastResponse = () => {
    const fallbackLast =
      lastAIResponse ||
      (chats[activeSubject] || [])
        .slice()
        .reverse()
        .find(m => m.role === 'model' || m.role === 'ai')?.rawText ||
      '';
    if (!fallbackLast) {
      showToast('Nessuna risposta AI recente da aggiungere.', 'error');
      return;
    }
    handleInsertAiMessageToNotes(fallbackLast);
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

    if (action === 'evidenzia_selezione' && savedRange) {
      handleAiHighlightOrEditNotes({
        mode: 'highlight',
        instruction: 'Evidenzia i concetti chiave nella selezione',
        onlySelection: true,
        savedRange
      });
      return;
    }

    if (action === 'migliora_sul_posto' && savedRange) {
      handleAiHighlightOrEditNotes({
        mode: 'edit',
        instruction: 'Migliora e formatta la selezione sul posto',
        onlySelection: true,
        savedRange
      });
      return;
    }

    if (action === 'evidenzia_tutta_nota') {
      handleAiHighlightOrEditNotes({
        mode: 'highlight',
        instruction: 'Evidenzia i concetti chiave negli appunti'
      });
      return;
    }

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
            <button
              type="button"
              className="top-btn top-btn-cmd-palette"
              onClick={() => setIsCommandPaletteOpen(true)}
              title="Apri Command Palette rapida (Ctrl+K)"
            >
              ⚡ Cerca <kbd className="topbar-kbd">Ctrl+K</kbd>
            </button>
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
            <button
              type="button"
              className={`app-card ${activeTab === 'calendar' ? 'active-tool-card' : ''}`}
              onClick={() => setActiveTab(prev => (prev === 'calendar' ? 'notes' : 'calendar'))}
              title="Apri il Calendario Studio, Compiti, Lezioni e Google Calendar"
              style={{ border: '1px solid var(--panel-border)', cursor: 'pointer', textAlign: 'left' }}
            >
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
                <path d="M8 18h.01" /><path d="M12 18h.01" />
              </svg>
              <span className="app-name">
                Calendario{calendarEvents.length > 0 ? ` (${calendarEvents.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              className={`app-card ${isStudyReviewOpen ? 'active-tool-card' : ''}`}
              onClick={() => setIsStudyReviewOpen(true)}
              title="Apri lo Studio Flashcard 3D & Quiz con storico sessioni (Gemini 3.6 Flash)"
              style={{ border: '1px solid var(--panel-border)', cursor: 'pointer', textAlign: 'left' }}
            >
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="5" width="14" height="10" rx="2" />
                <path d="M7 15v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                <path d="M7 9h6" />
                <path d="M7 12h4" />
              </svg>
              <span className="app-name">Flashcard &amp; Quiz</span>
            </button>
            <button
              type="button"
              className={`app-card ${isMindMapOpen ? 'active-tool-card' : ''}`}
              onClick={() => setIsMindMapOpen(true)}
              title="Apri lo Studio Mappa Concettuale Interattiva (Gemini 3.6 Flash + Editor visuale)"
              style={{ border: '1px solid var(--panel-border)', cursor: 'pointer', textAlign: 'left' }}
            >
              <svg className="app-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="3" />
                <circle cx="4.5" cy="6" r="2" />
                <circle cx="19.5" cy="6" r="2" />
                <circle cx="4.5" cy="18" r="2" />
                <circle cx="19.5" cy="18" r="2" />
                <line x1="9.5" y1="10.2" x2="6.2" y2="7.4" />
                <line x1="14.5" y1="10.2" x2="17.8" y2="7.4" />
                <line x1="9.5" y1="13.8" x2="6.2" y2="16.6" />
                <line x1="14.5" y1="13.8" x2="17.8" y2="16.6" />
              </svg>
              <span className="app-name">Mappa Concettuale</span>
            </button>
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
            calendarEvents={calendarEvents}
            subjects={subjects}
            activeSubject={activeSubject}
            onAddCalendarEvent={handleAddCalendarEvent}
            onToggleCalendarComplete={handleToggleCalendarComplete}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            isGoogleCalendarConnected={!!googleOAuthAccessToken}
            isSyncingGoogleCalendar={isSyncingGoogleCalendar}
            onSyncGoogleCalendar={handleSyncGoogleCalendar}
            onOpenFullCalendar={() => setActiveTab('calendar')}
          />
        </div>

        {/* Center Column: Workspace Notes & Materials */}
        <div className={`panel ${isNotesMaximized ? 'notes-maximized' : ''} ${mobileTab === 'notes' || mobileTab === 'materials' ? 'mobile-active' : ''}`} id="notes-panel">
          
          {/* Top Unified Bar: Mode Switcher (Personal vs Shared) + View Switcher (Appunti vs Materiali vs Calendario) */}
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
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('calendar')}
                >
                  📅 Calendario ({calendarEvents.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${isStudyReviewOpen ? 'active' : ''}`}
                  onClick={() => setIsStudyReviewOpen(true)}
                  title="Apri Studio Flashcard 3D & Quiz con storico e selezione pagine"
                >
                  🧠 Flashcard &amp; Quiz
                </button>
                <button
                  type="button"
                  className={`tab-btn ${isMindMapOpen ? 'active' : ''}`}
                  onClick={() => setIsMindMapOpen(true)}
                  title="Apri Mappa Concettuale Interattiva con selezione schede, AI Gemini 3.6 Flash e strumenti di modifica"
                >
                  🗺️ Mappa Interattiva
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
                  {activeTab === 'notes' && (
                    <div className="study-power-actions">
                      <button
                        type="button"
                        className="header-btn study-action-pill"
                        onClick={() => setIsStudyReviewOpen(true)}
                        title="Modalità Ripasso Esame: Flashcard 3D & Quiz Verifica dai tuoi appunti"
                      >
                        🧠 Ripasso
                      </button>
                      <button
                        type="button"
                        className="header-btn study-action-pill"
                        onClick={() => setIsMindMapOpen(true)}
                        title="Genera Mappa Concettuale Interattiva dagli appunti"
                      >
                        🗺️ Mappa
                      </button>
                      <button
                        type="button"
                        className={`header-btn study-action-pill ${isVoiceDictationOpen ? 'is-active' : ''}`}
                        onClick={() => setIsVoiceDictationOpen(v => !v)}
                        title="Registrazione Lezione & Dettatura Vocale AI"
                      >
                        🎙️ Detta
                      </button>
                      <button
                        type="button"
                        className={`header-btn study-action-pill ${isSplitScreenOpen ? 'is-active' : ''}`}
                        onClick={() => setIsSplitScreenOpen(v => !v)}
                        title="Vista Split-Screen: affianca un'altra scheda o una dispensa PDF"
                      >
                        🔀 Split
                      </button>
                      <button
                        type="button"
                        className="header-btn study-action-pill"
                        onClick={() => setIsExportDispensaOpen(true)}
                        title="Esporta Dispensa Impaginata in PDF, Word (.doc) o Markdown (.md) con Sommario"
                      >
                        📄 Esporta
                      </button>
                      <button
                        type="button"
                        className={`header-btn toolbar-collapse-header-btn ${isEditorToolbarCollapsed ? 'is-collapsed' : ''}`}
                        onClick={handleToggleEditorToolbar}
                        title={
                          isEditorToolbarCollapsed
                            ? 'Mostra barra strumenti degli appunti'
                            : 'Nascondi barra strumenti degli appunti'
                        }
                      >
                        {isEditorToolbarCollapsed ? '🛠️ ▼' : '🛠️ ▲'}
                      </button>
                    </div>
                  )}
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
                {activeTab === 'notes' && (
                  <button
                    type="button"
                    className={`header-btn toolbar-collapse-header-btn ${isEditorToolbarCollapsed ? 'is-collapsed' : ''}`}
                    onClick={handleToggleEditorToolbar}
                    title={
                      isEditorToolbarCollapsed
                        ? 'Mostra barra strumenti degli appunti'
                        : 'Nascondi barra strumenti degli appunti'
                    }
                  >
                    {isEditorToolbarCollapsed ? '🛠️ ▼ Strumenti' : '🛠️ ▲ Nascondi Strumenti'}
                  </button>
                )}
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
              <div id="notes-area-container" key="tab-notes" className="tab-panel-transition">
                {/* VS Code Style Tabs Bar */}
                <div className="vscode-tabs-bar">
                  <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                    {workspaceMode === 'shared' ? (
                      activeRoomPages.map((page, idx) => (
                        <div
                          key={page.id}
                          ref={el => {
                            tabElRefs.current[page.id] = el;
                          }}
                          draggable
                          data-tab-index={idx}
                          data-tab-id={page.id}
                          className={`vscode-tab ${page.id === activeRoomPageId ? 'active' : ''} ${
                            draggingTabId === page.id ? 'is-dragging' : ''
                          }`}
                          onDragStart={e => {
                            draggingTabIdRef.current = page.id;
                            didReorderDuringDragRef.current = false;
                            setDraggingTabId(page.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', page.id);
                          }}
                          onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const draggedId = draggingTabIdRef.current;
                            if (!draggedId || draggedId === page.id) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const midX = rect.left + rect.width / 2;
                            const fromIdx = activeRoomPages.findIndex(p => p.id === draggedId);
                            if (fromIdx === -1) return;
                            // Smooth midpoint hysteresis so tabs glide without flickering
                            if ((fromIdx < idx && e.clientX >= midX - 6) || (fromIdx > idx && e.clientX <= midX + 6)) {
                              handleLiveSwapNoteTabs(draggedId, page.id, true);
                            }
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            const draggedId = draggingTabIdRef.current || e.dataTransfer.getData('text/plain');
                            if (didReorderDuringDragRef.current) {
                              didReorderDuringDragRef.current = false;
                              persistReorderedNoteTabs(true);
                            } else if (draggedId && draggedId !== page.id) {
                              const fromIdx = activeRoomPages.findIndex(p => p.id === draggedId);
                              if (fromIdx !== -1 && fromIdx !== idx) {
                                handleReorderNoteTabs(fromIdx, idx, true);
                              }
                            }
                            draggingTabIdRef.current = null;
                            setDraggingTabId(null);
                          }}
                          onDragEnd={() => {
                            if (didReorderDuringDragRef.current) {
                              didReorderDuringDragRef.current = false;
                              persistReorderedNoteTabs(true);
                            }
                            draggingTabIdRef.current = null;
                            setDraggingTabId(null);
                          }}
                          onClick={() => handleSelectSharedRoomPageTab(page.id)}
                          onContextMenu={e => {
                            e.preventDefault();
                            handleRenameRoomPage(page.id);
                          }}
                          title="Trascina per riordinare • Clicca per aprire • Clic destro per rinominare (condiviso)"
                        >
                          <span className="tab-drag-grip" aria-hidden="true">⋮⋮</span>
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
                      currentSubPages.map((page, idx) => (
                        <div
                          key={page.id}
                          ref={el => {
                            tabElRefs.current[page.id] = el;
                          }}
                          draggable
                          data-tab-index={idx}
                          data-tab-id={page.id}
                          className={`vscode-tab ${page.id === activePageId ? 'active' : ''} ${
                            draggingTabId === page.id ? 'is-dragging' : ''
                          }`}
                          onDragStart={e => {
                            draggingTabIdRef.current = page.id;
                            didReorderDuringDragRef.current = false;
                            setDraggingTabId(page.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', page.id);
                          }}
                          onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const draggedId = draggingTabIdRef.current;
                            if (!draggedId || draggedId === page.id) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const midX = rect.left + rect.width / 2;
                            const fromIdx = currentSubPages.findIndex(p => p.id === draggedId);
                            if (fromIdx === -1) return;
                            if ((fromIdx < idx && e.clientX >= midX - 6) || (fromIdx > idx && e.clientX <= midX + 6)) {
                              handleLiveSwapNoteTabs(draggedId, page.id, false);
                            }
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            const draggedId = draggingTabIdRef.current || e.dataTransfer.getData('text/plain');
                            if (didReorderDuringDragRef.current) {
                              didReorderDuringDragRef.current = false;
                              persistReorderedNoteTabs(false);
                            } else if (draggedId && draggedId !== page.id) {
                              const fromIdx = currentSubPages.findIndex(p => p.id === draggedId);
                              if (fromIdx !== -1 && fromIdx !== idx) {
                                handleReorderNoteTabs(fromIdx, idx, false);
                              }
                            }
                            draggingTabIdRef.current = null;
                            setDraggingTabId(null);
                          }}
                          onDragEnd={() => {
                            if (didReorderDuringDragRef.current) {
                              didReorderDuringDragRef.current = false;
                              persistReorderedNoteTabs(false);
                            }
                            draggingTabIdRef.current = null;
                            setDraggingTabId(null);
                          }}
                          onClick={() => handleSelectPersonalPageTab(page.id)}
                          onContextMenu={e => {
                            e.preventDefault();
                            handleRenamePage(page.id);
                          }}
                          title="Trascina per riordinare • Clicca per aprire • Clic destro per rinominare"
                        >
                          <span className="tab-drag-grip" aria-hidden="true">⋮⋮</span>
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
                  <button
                    type="button"
                    className={`toolbar-corner-toggle-btn ${isEditorToolbarCollapsed ? 'is-collapsed' : ''}`}
                    onClick={handleToggleEditorToolbar}
                    title={
                      isEditorToolbarCollapsed
                        ? 'Mostra barra degli strumenti degli appunti'
                        : 'Nascondi barra degli strumenti degli appunti'
                    }
                  >
                    {isEditorToolbarCollapsed ? '🛠️ ▼' : '▲'}
                  </button>
                </div>

                {/* Simplified Horizontal Drawing Toolbar when isDrawingMode is active, or Collapsible Rich Text Toolbar otherwise */}
                {isDrawingMode ? (
                  <div key="toolbar-drawing" className="editor-toolbar notes-drawing-bar toolbar-slide-down">
                    <button
                      type="button"
                      className={`drawing-tool-pill ${drawingTool === 'pen' ? 'active' : ''}`}
                      onClick={() => setDrawingTool('pen')}
                      title="Disegna a mano libera (Penna)"
                    >
                      ✏️ Penna
                    </button>
                    <button
                      type="button"
                      className={`drawing-tool-pill ${drawingTool === 'eraser' ? 'active' : ''}`}
                      onClick={() => setDrawingTool('eraser')}
                      title="Cancella singoli tratti toccandoli (Gomma)"
                    >
                      🧹 Gomma
                    </button>

                    <span className="divider"></span>

                    {/* Compact Pen Color Swatches + Custom Color Picker */}
                    <div className="toolbar-swatch-group" title="Colore Penna">
                      {savedPenColors.map(c => (
                        <div key={c} className="swatch-dot-wrap">
                          <button
                            type="button"
                            className="swatch-dot-btn"
                            style={{
                              backgroundColor: c,
                              outline: drawingColor === c ? '2px solid #ffffff' : 'none'
                            }}
                            onClick={() => {
                              setDrawingColor(c);
                              if (drawingTool === 'eraser') setDrawingTool('pen');
                            }}
                            title={`Colore ${c}`}
                          />
                          <button
                            type="button"
                            className="swatch-del-badge"
                            onClick={e => {
                              e.stopPropagation();
                              handleUpdateSavedPenColors(removeColorFromPalette(savedPenColors, c));
                            }}
                            title="Rimuovi colore rapido"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <label
                        className="color-wheel-label-btn"
                        title="Ruota colori personalizzata"
                      >
                        <input
                          type="color"
                          value={drawingColor.startsWith('#') ? drawingColor : '#38bdf8'}
                          onChange={e => {
                            const hex = e.target.value;
                            setDrawingColor(hex);
                            if (drawingTool === 'eraser') setDrawingTool('pen');
                            handleUpdateSavedPenColors(addColorToPalette(savedPenColors, hex));
                          }}
                        />
                      </label>
                    </div>

                    <span className="divider"></span>

                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onClick={handleUndoLastDrawing}
                      title="Annulla ultimo tratto"
                    >
                      ↩️ Annulla
                    </button>
                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      onClick={handleClearAllDrawings}
                      title="Pulisci tutti i disegni nella pagina"
                    >
                      🗑️ Pulisci
                    </button>

                    <button
                      type="button"
                      className="drawing-tool-pill active"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setIsDrawingMode(false)}
                      title="Torna alla scrittura testo (Esc)"
                    >
                      ✓ Chiudi Penna
                    </button>
                  </div>
                ) : !isEditorToolbarCollapsed ? (
                <div key="toolbar-editor" className="editor-toolbar toolbar-slide-down">
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
                    onClick={() => {
                      setIsDrawingMode(prev => {
                        const next = !prev;
                        if (next) {
                          setSelectedImageEl(null);
                          setSelectedDrawingEl(null);
                          setSelectionBoxRect(null);
                        }
                        return next;
                      });
                    }}
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
                    <button
                      type="button"
                      className="editor-action-btn toolbar-inline-collapse-btn"
                      onClick={handleToggleEditorToolbar}
                      title="Nascondi la barra degli strumenti degli appunti"
                    >
                      ▲ Nascondi
                    </button>
                  </div>
                </div>
                ) : null}

                {/* Floating Interactive Table Editing Bar (when cursor is inside a .note-table and not drawing) */}
                {activeTableCell && !isDrawingMode && (
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

                {/* Floating Word-Style Image Layout & Anchor Toolbar (ONLY when an image is selected and NOT in Drawing Mode) */}
                {selectedImageEl && !isDrawingMode && (
                  <div className="note-image-floating-bar">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                      🖼️ Foto selezionata (trascina la foto per spostarla o i bordi blu per ridimensionarla):
                    </span>
                    {(
                      [
                        { id: 'inline', label: '═ In linea' },
                        { id: 'wrap-left', label: '◧ Testo a Destra' },
                        { id: 'wrap-right', label: '◨ Testo a Sinistra' },
                        { id: 'behind', label: '🌅 Dietro Testo' },
                        { id: 'front', label: '🚀 Libera (Davanti)' }
                      ] as Array<{ id: ImageLayoutMode; label: string }>
                    ).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className={`drawing-tool-pill ${selectedImageMeta.layout === m.id ? 'active' : ''}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleImageLayoutChange(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}

                    <button
                      type="button"
                      className={`drawing-tool-pill ${selectedImageMeta.pinned ? 'active' : ''}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={handleToggleImagePin}
                      title="Blocca/Fissa la foto oppure sbloccala per trascinarla liberamente col mouse"
                    >
                      {selectedImageMeta.pinned ? '📌 Fissata' : '🔓 Libera'}
                    </button>

                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setSelectedImageEl(null);
                        setSelectionBoxRect(null);
                        setIsDrawingMode(true);
                      }}
                      title="Attiva la penna per disegnare sopra questa foto (chiude questa barra)"
                    >
                      ✏️ Disegna su Foto
                    </button>

                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      style={{ marginLeft: 'auto' }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={handleDeleteSelectedImage}
                      title="Elimina questa foto dagli appunti (oppure premi Canc / Backspace)"
                    >
                      🗑️ Elimina Foto
                    </button>
                  </div>
                )}

                {/* Floating Post-Esc Drawing Selection & Modification Toolbar */}
                {selectedDrawingEl && !isDrawingMode && (
                  <div className="note-image-floating-bar">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                      ✏️ Disegno selezionato (trascinalo per spostarlo o usa i bordi per ridimensionarlo):
                    </span>

                    <div className="toolbar-swatch-group" title="Cambia colore al disegno selezionato">
                      {savedPenColors.map(c => (
                        <button
                          key={c}
                          type="button"
                          className="swatch-dot-btn"
                          style={{ backgroundColor: c }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleModifySelectedDrawingColor(c)}
                          title={`Colore ${c}`}
                        />
                      ))}
                    </div>

                    {[2, 4, 7, 12].map(w => (
                      <button
                        key={w}
                        type="button"
                        className="drawing-tool-pill"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleModifySelectedDrawingWidth(w)}
                        title={`Cambia spessore a ${w}px`}
                      >
                        {w}px
                      </button>
                    ))}

                    <button
                      type="button"
                      className="drawing-tool-pill"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setSelectedDrawingEl(null);
                        setSelectionBoxRect(null);
                        setIsDrawingMode(true);
                      }}
                    >
                      ✏️ Aggiungi Tratti
                    </button>

                    <button
                      type="button"
                      className="drawing-tool-pill danger"
                      style={{ marginLeft: 'auto' }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={handleDeleteSelectedDrawing}
                      title="Elimina questo disegno dagli appunti (Canc / Backspace)"
                    >
                      🗑️ Elimina Disegno
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

                {/* AI Direct Note Highlight / Edit 1-Click Undo Banner */}
                {aiUndoHtmlSnapshot && (
                  <div className="ai-undo-banner">
                    <span>✨ Appunti evidenziati / modificati automaticamente da Gemini AI</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="widget-mini-btn accent"
                        onClick={handleUndoAiNoteEdit}
                        title="Ripristina gli appunti esattamente com'erano prima dell'intervento AI"
                      >
                        ↩️ Annulla Modifica AI
                      </button>
                      <button
                        type="button"
                        className="widget-ctrl-btn"
                        onClick={() => setAiUndoHtmlSnapshot(null)}
                        title="Mantieni le modifiche AI e chiudi questo avviso"
                      >
                        ✓ Mantieni
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Lecture Voice Dictation & AI Structuring Bar */}
                <VoiceDictationBar
                  isOpen={isVoiceDictationOpen}
                  onClose={() => setIsVoiceDictationOpen(false)}
                  subjectName={activeSubject}
                  apiKeys={apiKeys}
                  selectedKeyIndex={selectedKeyIndex}
                  selectedModel={selectedModel}
                  onInsertHtml={handleInsertHtmlIntoNotes}
                  onNotify={showToast}
                />

                {/* Split-Screen Container (Single Editor OR Side-by-Side Reference Note/PDF) */}
                <div className={`notes-split-container ${isSplitScreenOpen ? 'is-split' : ''}`}>
                  {/* Stage Wrapper for #notes-area + Interactive 8-Handle Photo/Drawing Resize Frame */}
                  <div
                    ref={notesStageRef}
                    className="notes-surface-stage"
                    style={{
                      position: 'relative',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      minWidth: 0
                    }}
                  >
                    <div
                      id="notes-area"
                      ref={notesAreaRef}
                      data-slide-dir={noteSlideClass || undefined}
                      className={`font-${fontFamily} ${noteSlideClass} ${isDrawingMode ? 'drawing-mode-active' : ''} ${
                        isDrawingMode && drawingTool === 'eraser' ? 'eraser-active' : ''
                      }`}
                      style={{ fontSize: `${fontSize}px` }}
                      contentEditable={!isDrawingMode}
                      suppressContentEditableWarning
                      data-placeholder="Inizia a scrivere i tuoi appunti... Incolla screenshot (Ctrl+V), inserisci tabelle, disegna con la penna o usa le scorciatoie."
                      onInput={handleNotesAreaInput}
                      onChange={handleNotesAreaChange}
                      onKeyDown={handleNotesAreaKeyDown}
                      onPaste={handleNotesPaste}
                      onScroll={handleNotesScroll}
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

                    {/* 8-Handle Interactive Border/Corner Resize Frame for Selected Photo or Post-Esc Drawing */}
                    {!isDrawingMode && (selectedImageEl || selectedDrawingEl) && selectionBoxRect && (
                      <div
                        className="note-object-selection-frame"
                        style={{
                          top: `${selectionBoxRect.top}px`,
                          left: `${selectionBoxRect.left}px`,
                          width: `${selectionBoxRect.width}px`,
                          height: `${selectionBoxRect.height}px`
                        }}
                      >
                        {(
                          ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Array<
                            'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
                          >
                        ).map(h => (
                          <div
                            key={h}
                            className={`note-resize-handle ${h}`}
                            onMouseDown={e => handleStartResizeObject(h, e)}
                            title="Trascina per ridimensionare"
                          />
                        ))}
                        <button
                          type="button"
                          className="note-object-del-corner"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (selectedImageEl) handleDeleteSelectedImage();
                            else if (selectedDrawingEl) handleDeleteSelectedDrawing();
                          }}
                          title="Elimina elemento selezionato"
                          style={{
                            position: 'absolute',
                            top: '-14px',
                            right: '14px',
                            pointerEvents: 'auto',
                            background: '#e11d48',
                            color: '#ffffff',
                            border: '1px solid #fda4af',
                            borderRadius: '6px',
                            padding: '2px 7px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                            zIndex: 32
                          }}
                        >
                          🗑️ Elimina
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Secondary Split-Screen Pane (Another Note Tab OR PDF/Material) */}
                  {isSplitScreenOpen && (
                    <SplitScreenPane
                      activeSubject={activeSubject}
                      activePageId={activePageId}
                      pagesBySubject={pages}
                      materialsBySubject={materials}
                      onClose={() => setIsSplitScreenOpen(false)}
                      onOpenInMainEditor={(subId, pId) => {
                        setWorkspaceMode('personal');
                        setActiveTab('notes');
                        if (subId !== activeSubject) {
                          handleSelectSubject(subId);
                        }
                        setTimeout(() => handleSelectPersonalPageTab(pId), 20);
                      }}
                    />
                  )}
                </div>
              </div>
            ) : activeTab === 'calendar' ? (
              <div
                key="tab-calendar"
                className="tab-panel-transition"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              >
                <StudyCalendarPanel
                  events={calendarEvents}
                  subjects={subjects}
                  activeSubject={activeSubject}
                  onAddEvent={handleAddCalendarEvent}
                  onToggleComplete={handleToggleCalendarComplete}
                  onDeleteEvent={handleDeleteCalendarEvent}
                  isGoogleCalendarConnected={!!googleOAuthAccessToken}
                  googleCalendarEmail={googleCalendarEmail}
                  calendarApiEnableUrl={calendarApiEnableUrl}
                  onDismissApiEnableUrl={() => setCalendarApiEnableUrl(null)}
                  isSyncingGoogle={isSyncingGoogleCalendar}
                  onSyncGoogleCalendar={handleSyncGoogleCalendar}
                  onSwitchGoogleCalendarAccount={handleSwitchGoogleCalendarAccount}
                  onImportIcsFile={handleImportIcsCalendarFile}
                  onBackToNotes={() => setActiveTab('notes')}
                />
              </div>
            ) : (
              <div id="materials-area" key="tab-materials" className="tab-panel-transition">
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
            calendarEvents={calendarEvents}
            subjects={subjects}
            activeSubject={activeSubject}
            onAddCalendarEvent={handleAddCalendarEvent}
            onToggleCalendarComplete={handleToggleCalendarComplete}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            isGoogleCalendarConnected={!!googleOAuthAccessToken}
            isSyncingGoogleCalendar={isSyncingGoogleCalendar}
            onSyncGoogleCalendar={handleSyncGoogleCalendar}
            onOpenFullCalendar={() => setActiveTab('calendar')}
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
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '6px' }}>
                            <button
                              className="msg-action-btn"
                              style={{ position: 'static', opacity: 0.9 }}
                              title="Inserisci negli Appunti (con Box Codice / Formule / Citazioni interattive)"
                              onClick={() => handleInsertAiMessageToNotes(text)}
                            >
                              ➕ Appunti
                            </button>
                            <button
                              className="msg-action-btn"
                              style={{ position: 'static', opacity: 0.9 }}
                              title="Copia risposta"
                              onClick={() => handleCopyAiMessage(text)}
                            >
                              📋
                            </button>
                          </div>
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
                  Chiedi qualcosa, scrivi <b>"evidenzia le cose chiave"</b>, chiedi di generare codice/formule o scrivi <i>"nel blocco di codice dove faccio fibonacci sistemalo e sostituiscilo nella box"</i>!
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
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button
                            className="msg-action-btn"
                            style={{ position: 'static', opacity: 0.9 }}
                            title="Inserisci negli Appunti (con Box Codice / Formule / Citazioni interattive)"
                            onClick={() => handleInsertAiMessageToNotes(text)}
                          >
                            ➕ Appunti
                          </button>
                          <button
                            className="msg-action-btn"
                            style={{ position: 'static', opacity: 0.9 }}
                            title="Copia risposta"
                            onClick={() => handleCopyAiMessage(text)}
                          >
                            📋
                          </button>
                        </div>
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
                placeholder="Chiedi a Gemini o scrivi 'evidenzia le cose chiave'..."
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
            <div className="chat-input-row" style={{ marginTop: '8px', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
              <button className="chat-btn" onClick={handleAnalyzeNotes} title="Analizza o riassumi gli appunti in chat">
                🔍 Analizza
              </button>
              <button
                className="chat-btn"
                onClick={() =>
                  handleAiHighlightOrEditNotes({
                    mode: 'highlight',
                    instruction: chatInput.trim() || 'Evidenzia i concetti chiave negli appunti',
                    targetTopic: chatInput.trim() ? parseAiNoteEditIntent(chatInput.trim()).targetTopic : null
                  })
                }
                style={{ borderColor: 'rgba(250, 204, 21, 0.45)', color: '#fef08a' }}
                title="Evidenzia direttamente negli appunti i concetti chiave (o scrivi nell'input un argomento specifico e premi qui)"
              >
                🖍️ Evidenzia Chiave
              </button>
              <button className="chat-btn" onClick={handleAppendLastResponse} title="Aggiungi l'ultima risposta AI in fondo agli appunti">
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
            calendarEvents={calendarEvents}
            subjects={subjects}
            activeSubject={activeSubject}
            onAddCalendarEvent={handleAddCalendarEvent}
            onToggleCalendarComplete={handleToggleCalendarComplete}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            isGoogleCalendarConnected={!!googleOAuthAccessToken}
            isSyncingGoogleCalendar={isSyncingGoogleCalendar}
            onSyncGoogleCalendar={handleSyncGoogleCalendar}
            onOpenFullCalendar={() => setActiveTab('calendar')}
          />
        </div>

        {/* Dedicated Full-Height Column for Large Widgets (PDF Viewer, Website, Image, Calculator, Calendar, etc.) */}
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
              calendarEvents={calendarEvents}
              subjects={subjects}
              activeSubject={activeSubject}
              onAddCalendarEvent={handleAddCalendarEvent}
              onToggleCalendarComplete={handleToggleCalendarComplete}
              onDeleteCalendarEvent={handleDeleteCalendarEvent}
              isGoogleCalendarConnected={!!googleOAuthAccessToken}
              isSyncingGoogleCalendar={isSyncingGoogleCalendar}
              onSyncGoogleCalendar={handleSyncGoogleCalendar}
              onOpenFullCalendar={() => setActiveTab('calendar')}
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
            {/* Refined Context Menu Top Banner */}
            <div className="ctx-menu-top-banner">
              <span>
                {contextMenu.selectedText
                  ? `✂️ Selezione (${contextMenu.selectedText.length} car.)`
                  : '⚡ Menu Rapido Appunti'}
              </span>
              <button
                type="button"
                className="widget-ctrl-btn"
                style={{ height: '18px', minWidth: '18px', fontSize: '0.62rem' }}
                onClick={() => setContextMenu(prev => ({ ...prev, visible: false }))}
                title="Chiudi menu"
              >
                ✕
              </button>
            </div>

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

            {/* Box 4: Azioni AI Gemini (Sulla Selezione o Sulla Nota Intera) */}
            <div className="ctx-group-box">
              <div className="ctx-group-box-header">
                <span>🤖 Azioni AI Gemini</span>
              </div>
              {contextMenu.selectedText ? (
                <>
                  <button
                    type="button"
                    className="ctx-ai-highlight-btn"
                    onClick={() => handleContextMenuAction('evidenzia_selezione')}
                    title="Evidenzia con l'AI i concetti chiave solo nella parte selezionata"
                  >
                    <span>🖍️</span>
                    <span>Evidenzia concetti chiave (qui)</span>
                  </button>
                  <button
                    type="button"
                    className="ctx-ai-highlight-btn"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(56, 189, 248, 0.14))',
                      borderColor: 'rgba(99, 102, 241, 0.45)',
                      color: '#c7d2fe'
                    }}
                    onClick={() => handleContextMenuAction('migliora_sul_posto')}
                    title="Riscrive e formatta solo la parte selezionata sostituendola direttamente negli appunti"
                  >
                    <span>🪄</span>
                    <span>Migliora e sostituisci sul posto</span>
                  </button>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('correggi')}>
                    <span>✨ Correggi grammatica (in Chat)</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('riassumi')}>
                    <span>📝 Riassumi selezione (in Chat)</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('spiega')}>
                    <span>🧠 Spiegami questo concetto</span>
                  </div>
                  <div className="context-menu-item" onClick={() => handleContextMenuAction('traduci')}>
                    <span>🌍 Traduci e Analizza</span>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ctx-ai-highlight-btn"
                    onClick={() => handleContextMenuAction('evidenzia_tutta_nota')}
                    title="Chiedi a Gemini di evidenziare i concetti chiave in tutta la pagina"
                  >
                    <span>🖍️</span>
                    <span>Evidenzia concetti chiave nella nota</span>
                  </button>
                  <div
                    className="context-menu-item"
                    onClick={() => handleContextMenuAction('incolla_ai')}
                    style={{ opacity: lastAIResponse ? 1 : 0.5, pointerEvents: lastAIResponse ? 'auto' : 'none' }}
                  >
                    <span>📋 {lastAIResponse ? 'Incolla ultima risposta AI' : 'Seleziona testo per azioni mirate'}</span>
                  </div>
                </>
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

      {/* MODAL #1: FLASHCARD 3D & QUIZ VERIFICA ITS */}
      <StudyReviewModal
        isOpen={isStudyReviewOpen}
        onClose={() => setIsStudyReviewOpen(false)}
        subjectName={activeSubject}
        activePage={
          workspaceMode === 'shared'
            ? activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0] || null
            : currentSubPages.find(p => p.id === activePageId) || currentSubPages[0] || null
        }
        allSubjectPages={workspaceMode === 'shared' ? activeRoomPages : currentSubPages}
        subjects={subjects}
        pagesBySubject={pages}
        isSharedMode={workspaceMode === 'shared'}
        apiKeys={apiKeys}
        selectedKeyIndex={selectedKeyIndex}
        onNotify={showToast}
      />

      {/* MODAL #2: MAPPA CONCETTUALE INTERATTIVA AUTOMATICA & EDITOR STUDIO */}
      <MindMapModal
        isOpen={isMindMapOpen}
        onClose={() => setIsMindMapOpen(false)}
        subjectName={activeSubject}
        activePage={
          workspaceMode === 'shared'
            ? activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0] || null
            : currentSubPages.find(p => p.id === activePageId) || currentSubPages[0] || null
        }
        allSubjectPages={workspaceMode === 'shared' ? activeRoomPages : currentSubPages}
        subjects={subjects}
        pagesBySubject={pages}
        isSharedMode={workspaceMode === 'shared'}
        apiKeys={apiKeys}
        selectedKeyIndex={selectedKeyIndex}
        onNotify={showToast}
      />

      {/* MODAL #3: COMMAND PALETTE (CTRL+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        subjects={subjects}
        pagesBySubject={pages}
        materialsBySubject={materials}
        quickActions={
          [
            {
              id: 'qa_new_page',
              title: 'Nuova Scheda Appunti',
              subtitle: `Crea una nuova scheda in ${activeSubject}`,
              icon: '➕',
              group: 'Azioni Rapide',
              onExecute: () => {
                setActiveTab('notes');
                if (workspaceMode === 'shared') handleAddNewRoomPage();
                else handleAddNewPage();
              }
            },
            {
              id: 'qa_study_review',
              title: 'Modalità Ripasso: Flashcard 3D & Quiz',
              subtitle: 'Genera flashcard e quiz verifica dagli appunti',
              icon: '🧠',
              group: 'Azioni Rapide',
              onExecute: () => setIsStudyReviewOpen(true)
            },
            {
              id: 'qa_mindmap',
              title: 'Mappa Concettuale Automatica',
              subtitle: 'Visualizza la struttura interattiva della lezione',
              icon: '🗺️',
              group: 'Azioni Rapide',
              onExecute: () => setIsMindMapOpen(true)
            },
            {
              id: 'qa_voice',
              title: isVoiceDictationOpen ? 'Chiudi Dettatura Vocale' : 'Avvia Dettatura Vocale Lezione',
              subtitle: 'Trascrivi a voce e riordina con Gemini AI',
              icon: '🎙️',
              group: 'Azioni Rapide',
              onExecute: () => {
                setActiveTab('notes');
                setIsVoiceDictationOpen(v => !v);
              }
            },
            {
              id: 'qa_split',
              title: isSplitScreenOpen ? 'Disattiva Vista Split-Screen' : 'Attiva Vista Split-Screen (Doppio Foglio / PDF)',
              subtitle: 'Affianca una scheda o una dispensa PDF agli appunti',
              icon: '🔀',
              group: 'Azioni Rapide',
              onExecute: () => {
                setActiveTab('notes');
                setIsSplitScreenOpen(v => !v);
              }
            },
            {
              id: 'qa_export',
              title: 'Esporta Dispensa (PDF / Word / Markdown)',
              subtitle: 'Impaginazione con copertina e sommario automatico',
              icon: '📄',
              group: 'Azioni Rapide',
              onExecute: () => setIsExportDispensaOpen(true)
            },
            {
              id: 'qa_code_box',
              title: 'Inserisci Blocco Codice Interattivo',
              subtitle: 'Aggiungi una box codice eseguibile negli appunti',
              icon: '💻',
              group: 'Azioni Rapide',
              onExecute: () => {
                setActiveTab('notes');
                handleInsertDirectCodeBlock();
              }
            },
            {
              id: 'qa_formula_box',
              title: 'Inserisci Box Formula Live',
              subtitle: 'Aggiungi una formula matematica calcolata',
              icon: '∑',
              group: 'Azioni Rapide',
              onExecute: () => {
                setActiveTab('notes');
                handleInsertDirectFormulaBox();
              }
            },
            {
              id: 'qa_calendar',
              title: 'Vai al Calendario Studi & Lezioni',
              subtitle: 'Apri viste Giorno, Settimana, Mese e Agenda',
              icon: '📅',
              group: 'Azioni Rapide',
              onExecute: () => setActiveTab('calendar')
            }
          ] as CommandPaletteAction[]
        }
        onJumpToSubject={subId => {
          setWorkspaceMode('personal');
          setActiveTab('notes');
          handleSelectSubject(subId);
        }}
        onJumpToPage={(subId, pId) => {
          setWorkspaceMode('personal');
          setActiveTab('notes');
          if (subId !== activeSubject) {
            handleSelectSubject(subId);
          }
          setTimeout(() => handleSelectPersonalPageTab(pId), 20);
        }}
        onOpenMaterial={(subId, mat) => {
          setWorkspaceMode('personal');
          if (subId !== activeSubject) handleSelectSubject(subId);
          handleOpenPreview(mat);
        }}
        onCreateCalendarReminderFromCommand={rawText => {
          const parsed = parseCalendarChatCommand(
            rawText,
            subjects.map(s => s.name)
          );
          if (parsed && parsed.isAddCommand) {
            handleAddCalendarEvent(
              {
                title: parsed.title,
                date: parsed.date,
                startTime: parsed.startTime,
                endTime: parsed.endTime,
                category: parsed.category,
                subject: parsed.subject || activeSubject,
                description: parsed.description || 'Creato tramite Command Palette (Ctrl+K)',
                completed: false
              },
              !!googleOAuthAccessToken
            );
            showToast(`📅 Promemoria "${parsed.title}" aggiunto per il ${parsed.date} alle ${parsed.startTime}!`);
            return true;
          }
          setActiveTab('calendar');
          return false;
        }}
      />

      {/* MODAL #7: ESPORTA DISPENSA (PDF / WORD / MARKDOWN) */}
      <ExportDispensaModal
        isOpen={isExportDispensaOpen}
        onClose={() => setIsExportDispensaOpen(false)}
        subjectName={activeSubject}
        authorName={currentUser?.displayName || currentUser?.email || 'Studente ITS'}
        activePage={
          workspaceMode === 'shared'
            ? activeRoomPages.find(p => p.id === activeRoomPageId) || activeRoomPages[0] || null
            : currentSubPages.find(p => p.id === activePageId) || currentSubPages[0] || null
        }
        allSubjectPages={workspaceMode === 'shared' ? activeRoomPages : currentSubPages}
        onNotify={showToast}
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
