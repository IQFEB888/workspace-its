export interface PageItem {
  id: string;
  name: string;
  content: string;
  order?: number;
}

export interface MaterialItem {
  id: string | number;
  name: string;
  url: string;
  category: string;
  createdAt?: string;
  fileType?: 'pdf' | 'doc' | 'image' | 'video' | 'link';
  fileSize?: number;
  mimeType?: string;
  fileData?: string;
  hasLocalFile?: boolean;
}

export interface ChatMessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'model' | 'ai';
  parts: ChatMessagePart[];
  rawText?: string;
  timestamp?: number;
}

export interface SubjectItem {
  id: string;
  name: string;
  driveLink?: string;
}

export type WidgetSlot = 'full_column' | 'right_bottom' | 'left_bottom' | 'center_bottom';

export type WidgetType =
  | 'pdf_viewer'
  | 'image_viewer'
  | 'web_embed'
  | 'calculator'
  | 'pomodoro'
  | 'quick_scratch';

export interface CustomWidget {
  id: string;
  type: WidgetType;
  title: string;
  slot: WidgetSlot;
  enabled: boolean;
  height?: number;
  width?: number;
  materialId?: string;
  customUrl?: string;
  imageData?: string;
  scratchText?: string;
}

export type ColumnLayoutPreset =
  | 'tools-notes-chat'
  | 'chat-notes-tools'
  | 'notes-chat-tools'
  | 'tools-chat-notes';

export type ShortcutActionId =
  | 'insert_code'
  | 'insert_formula'
  | 'insert_table'
  | 'toggle_pen'
  | 'insert_quote'
  | 'open_find'
  | 'highlight_text'
  | 'new_page'
  | 'toggle_chat'
  | 'toggle_sidebar'
  | 'toggle_compact';

export type ImageLayoutMode = 'inline' | 'wrap-left' | 'wrap-right' | 'behind' | 'front';

export type DrawingToolType = 'pen' | 'highlighter' | 'arrow' | 'line' | 'rect' | 'eraser';

export interface UserPreferences {
  bgIndex: number;
  isImmersion: boolean;
  isSidebarCollapsed: boolean;
  isChatCollapsed: boolean;
  activeSubject: string;
  activePageId: string;
  selectedModel: string;
  fontFamily?: string;
  fontSize?: number;
  showWeatherWidget?: boolean;
  compactMode?: boolean;
  accentColor?: string;
  panelTheme?: string;
  panelOpacity?: number;
  showDriveBar?: boolean;
  columnLayout?: ColumnLayoutPreset;
  leftColumnWidth?: number;
  rightColumnWidth?: number;
  widgetColumnWidth?: number;
  chatSplitRatio?: number;
  customWidgets?: CustomWidget[];
  customShortcuts?: Record<string, string>;
  savedTextColors?: string[];
  savedHighlightColors?: string[];
  savedPenColors?: string[];
}

export interface AttachedFile {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface DialogOptions {
  title: string;
  description?: string;
  fields?: Array<{
    id?: string;
    label?: string;
    placeholder?: string;
    value?: string;
    type?: string;
  }>;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  danger?: boolean;
}

export interface SharedRoomMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  joinedAt: string;
  lastActive?: string;
}

export interface SharedRoom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  members: Record<string, SharedRoomMember>;
}

export interface SharedChatMessage {
  id: string;
  role: 'user' | 'model';
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  parts: ChatMessagePart[];
  rawText?: string;
  timestamp: number;
}
