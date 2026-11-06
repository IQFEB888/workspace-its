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

export interface UserPreferences {
  bgIndex: number;
  isImmersion: boolean;
  isSidebarCollapsed: boolean;
  isChatCollapsed: boolean;
  activeSubject: string;
  activePageId: string;
  selectedModel: string;
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
