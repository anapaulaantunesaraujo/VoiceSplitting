export interface GoogleDriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  webViewLink?: string;
}

export interface UserVocalPracticeHistory {
  lastUpdated: string;
  totalPracticeSeconds: number;
  dailyGoalSeconds: number;
  pitchAccuracyRate: number; // percentage 0 - 100%
  completedDaysStreak: number;
  totalSessionsCompleted: number;
}

const FOLDER_NAME = 'Meu Treino Vocal';
const APPDATA_HISTORY_FILE = 'vocal_practice_history.json';
const REPERTOIRE_CATALOGUE_FILE = 'repertoire_catalogue.json';

/**
 * Service to interact directly with Google Drive REST API v3
 * supporting public user folder ('Meu Treino Vocal') and hidden 'appDataFolder' storage.
 */
export class GoogleDriveService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`
    };
  }

  /**
   * Searches for the 'Meu Treino Vocal' folder or creates it if it doesn't exist.
   */
  async getOrCreateTrainingFolder(): Promise<string> {
    const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, { headers: this.headers });
    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        throw new Error('Sessão do Google expirada (401 Unauthorized). Faça login novamente.');
      }
      throw new Error(`Erro ao buscar pasta no Google Drive: ${await searchRes.text()}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const metadata = {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!createRes.ok) {
      throw new Error(`Erro ao criar pasta 'Meu Treino Vocal' no Drive: ${await createRes.text()}`);
    }

    const newFolder = await createRes.json();
    return newFolder.id;
  }

  /**
   * Uploads an audio file or stem to the 'Meu Treino Vocal' folder using Multipart Upload
   */
  async uploadFileToTrainingFolder(file: File | Blob, filename: string, folderId: string): Promise<GoogleDriveFileItem> {
    const metadata = {
      name: filename,
      parents: [folderId]
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink';

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: this.headers,
      body: formData
    });

    if (!res.ok) {
      throw new Error(`Erro no upload para o Google Drive: ${await res.text()}`);
    }

    return await res.json();
  }

  /**
   * Lists all saved audio files and stems from the 'Meu Treino Vocal' folder
   */
  async listTrainingFiles(folderId: string): Promise<GoogleDriveFileItem[]> {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,webViewLink)&orderBy=createdTime desc`;

    const res = await fetch(listUrl, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Erro ao listar treinos salvos no Google Drive: ${await res.text()}`);
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Downloads a saved audio file or stem from Google Drive
   */
  async downloadFileAsBlob(fileId: string): Promise<Blob> {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(downloadUrl, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`Erro ao baixar arquivo do Drive: ${await res.text()}`);
    }

    return await res.blob();
  }

  /**
   * Saves daily practice history and gamification scores into the hidden Google Drive appDataFolder.
   */
  async savePracticeHistoryToAppData(history: UserVocalPracticeHistory): Promise<void> {
    // 1. Check if history JSON file already exists in hidden appDataFolder
    const query = encodeURIComponent(`name = '${APPDATA_HISTORY_FILE}' and 'appDataFolder' in parents and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, { headers: this.headers });
    let existingFileId: string | null = null;

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }

    const jsonBlob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });

    if (existingFileId) {
      // Update existing file in appDataFolder via PATCH upload
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: jsonBlob
      });

      if (!updateRes.ok) {
        throw new Error(`Erro ao atualizar histórico no appDataFolder: ${await updateRes.text()}`);
      }
    } else {
      // Create new file in hidden appDataFolder via Multipart Upload
      const metadata = {
        name: APPDATA_HISTORY_FILE,
        parents: ['appDataFolder']
      };

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', jsonBlob);

      const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder';
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: this.headers,
        body: formData
      });

      if (!createRes.ok) {
        throw new Error(`Erro ao salvar novo histórico no appDataFolder: ${await createRes.text()}`);
      }
    }
  }

  /**
   * Reads daily practice history and gamification scores from hidden appDataFolder
   */
  async loadPracticeHistoryFromAppData(): Promise<UserVocalPracticeHistory | null> {
    const query = encodeURIComponent(`name = '${APPDATA_HISTORY_FILE}' and 'appDataFolder' in parents and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, { headers: this.headers });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    if (!searchData.files || searchData.files.length === 0) return null;

    const fileId = searchData.files[0].id;
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadRes = await fetch(downloadUrl, { headers: this.headers });

    return await downloadRes.json();
  }

  /**
   * Saves the complete repertoire catalogue (imported songs list, folders, and metadata)
   * into the hidden appDataFolder in Google Drive, making it accessible on any device.
   */
  async saveCatalogueToAppData(catalogue: { songs: any[]; categories: any[]; lastUpdated?: string }): Promise<void> {
    const payload = {
      ...catalogue,
      lastUpdated: catalogue.lastUpdated || new Date().toISOString()
    };
    const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

    const query = encodeURIComponent(`name = '${REPERTOIRE_CATALOGUE_FILE}' and 'appDataFolder' in parents and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, { headers: this.headers });
    let existingFileId: string | null = null;

    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        throw new Error('Sessão do Google expirada (401 Unauthorized). Faça login novamente.');
      }
    } else {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }

    if (existingFileId) {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: jsonBlob
      });
      if (!updateRes.ok) {
        throw new Error(`Erro ao atualizar catálogo no Google Drive: ${await updateRes.text()}`);
      }
    } else {
      const metadata = {
        name: REPERTOIRE_CATALOGUE_FILE,
        parents: ['appDataFolder']
      };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', jsonBlob);

      const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder';
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: this.headers,
        body: formData
      });
      if (!createRes.ok) {
        throw new Error(`Erro ao salvar catálogo no Google Drive: ${await createRes.text()}`);
      }
    }
  }

  /**
   * Loads the repertoire catalogue (songs and categories) from Google Drive appDataFolder.
   * This is how a new phone or computer retrieves all user songs upon logging in!
   */
  async loadCatalogueFromAppData(): Promise<{ songs: any[]; categories: any[]; lastUpdated: string } | null> {
    const query = encodeURIComponent(`name = '${REPERTOIRE_CATALOGUE_FILE}' and 'appDataFolder' in parents and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, { headers: this.headers });
    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        throw new Error('Sessão do Google expirada (401 Unauthorized). Faça login novamente.');
      }
      return null;
    }

    const searchData = await searchRes.json();
    if (!searchData.files || searchData.files.length === 0) return null;

    const fileId = searchData.files[0].id;
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadRes = await fetch(downloadUrl, { headers: this.headers });

    if (!downloadRes.ok) return null;

    return await downloadRes.json();
  }
}
