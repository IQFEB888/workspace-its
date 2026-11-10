import { MaterialItem } from '../types';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface SyncResult {
  newMaterials: MaterialItem[];
  alreadyExistingCount: number;
  totalFound: number;
  folderId: string;
}

/**
 * Extracts Google Drive folder ID from various URL formats
 */
export function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  // /drive/folders/{id} or /drive/u/0/folders/{id}
  const foldersMatch = cleanUrl.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (foldersMatch && foldersMatch[1]) return foldersMatch[1];

  // /open?id={id}
  const openIdMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (openIdMatch && openIdMatch[1]) return openIdMatch[1];

  // raw folder ID if user pasted just the ID (typically 25-45 alphanumeric chars)
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  return null;
}

/**
 * Fetches files from a Google Drive folder using Google Drive API v3
 */
export async function fetchDriveFolderFiles(
  folderId: string,
  apiKey: string
): Promise<GoogleDriveFile[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Chiave API Google Drive mancante. Inserisci la tua chiave API di Google Cloud.');
  }

  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,createdTime,webViewLink,webContentLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=name&pageSize=100&key=${apiKey.trim()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    if (data.error) {
      const errMessage = data.error.message || 'Errore durante la chiamata a Google Drive API.';
      if (errMessage.toLowerCase().includes('api key not valid') || errMessage.toLowerCase().includes('keyinvalid')) {
        throw new Error('La chiave Google Drive API inserita non è valida. Verifica di averla copiata correttamente da Google Cloud Console.');
      }
      if (errMessage.toLowerCase().includes('not found') || response.status === 404) {
        throw new Error('Cartella Google Drive non trovata. Controlla il link della cartella.');
      }
      if (response.status === 403) {
        throw new Error('Accesso negato (403): assicurati che la cartella sia condivisa con "Chiunque abbia il link può visualizzare" e che l\'API Google Drive sia abilitata su Google Cloud.');
      }
      throw new Error(`Errore Google Drive: ${errMessage}`);
    }
    throw new Error(`Errore HTTP ${response.status} da Google Drive.`);
  }

  return (data.files as GoogleDriveFile[]) || [];
}

/**
 * Compares files in Drive folder against existing materials and returns new ones
 */
export function computeDriveMaterialsDiff(
  driveFiles: GoogleDriveFile[],
  existingMaterials: MaterialItem[],
  folderId: string,
  defaultCategory: string = 'Lezioni'
): SyncResult {
  // Build a lookup set of existing names and drive URLs
  const existingNames = new Set(existingMaterials.map(m => m.name.toLowerCase().trim()));
  const existingDriveIds = new Set(
    existingMaterials
      .map(m => {
        const idMatch = m.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        return idMatch ? idMatch[1] : null;
      })
      .filter(Boolean)
  );

  const newMaterials: MaterialItem[] = [];
  let alreadyExistingCount = 0;

  for (const file of driveFiles) {
    // Skip subfolders or unsupported Google Shortcuts
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      continue;
    }

    const isExisting =
      existingNames.has(file.name.toLowerCase().trim()) || existingDriveIds.has(file.id);

    if (isExisting) {
      alreadyExistingCount++;
    } else {
      const isPdf =
        file.mimeType.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.mimeType.startsWith('image/');
      const fileType = isPdf ? 'pdf' : isImg ? 'image' : 'link';

      const item: MaterialItem = {
        id: 'gdrive_' + file.id,
        name: file.name,
        url: `https://drive.google.com/file/d/${file.id}/view?usp=sharing`,
        category: defaultCategory,
        createdAt: file.createdTime || new Date().toISOString(),
        fileType,
        fileSize: file.size ? Number(file.size) : undefined,
        mimeType: file.mimeType,
        hasLocalFile: false
      };
      newMaterials.push(item);
    }
  }

  return {
    newMaterials,
    alreadyExistingCount,
    totalFound: driveFiles.length,
    folderId
  };
}
