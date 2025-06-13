import { LitElement, html, css } from 'lit';

// ipcRenderer is no longer used in this component.
// const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

class TranscriptionView extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: 16px;
      gap: 16px; /* Adds space between elements */
    }
    .controls {
      display: flex;
      gap: 8px; /* Space between buttons */
    }
    button {
      padding: 8px 16px;
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid #ccc;
    }
    button:hover {
      background-color: #f0f0f0;
    }
    textarea {
      width: 100%;
      height: 200px; /* Default height, can be adjusted */
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: monospace;
      font-size: 14px;
    }
  `;

  static properties = {
    // Properties to be passed from CheatingDaddyApp
    isTranscribing: { type: Boolean },
    transcribedText: { type: String },
    isActiveView: { type: Boolean },

    // Callbacks to be passed from CheatingDaddyApp
    onStartRequest: { type: Function },
    onStopRequest: { type: Function },
    onExportRequest: { type: Function },
  };

  constructor() {
    super();
    // Initialize with default/empty values, will be overwritten by props
    this.isTranscribing = false;
    this.transcribedText = '';
    this.isActiveView = false;

    this.onStartRequest = () => console.warn('onStartRequest not implemented');
    this.onStopRequest = () => console.warn('onStopRequest not implemented');
    this.onExportRequest = () => console.warn('onExportRequest not implemented');
  }

  // updated() method related to isActiveView has been removed as parent controls transcription state.
  // isActiveView can still be used for other UI purposes if needed (e.g., animations).

  toggleTranscription() {
    if (this.isTranscribing) {
      this.onStopRequest();
    } else {
      this.onStartRequest();
    }
  }

  exportToTxt() {
    console.log('TV: Export to TXT button clicked.');
    // Regex to remove status messages before exporting
    const cleanupRegex = /(\[(Recording started|Recording stopped|Processing audio segment|Sending to main process for transcription|Transcription|Transcription Error|IPC Error|Error reading audio data|No audio data to transcribe|Exporting...|Exported successfully to.*|Export failed.*|Nothing to export.)\.*\]\n*)/gm;
    const cleanText = this.transcribedText.replace(cleanupRegex, "").trim();

    if (!cleanText) {
        console.log('TV: Nothing to export after cleanup.');
        // Optionally, notify parent if you want to display this specific message via parent's state
        this.onExportRequest(""); // Send empty string to indicate nothing to export after cleanup
        return;
    }
    this.onExportRequest(cleanText);
  }

  render() {
    return html`
      <h2>Live Transcription</h2>
      <div class="controls">
        <button @click=${this.toggleTranscription}>
          ${this.isTranscribing ? 'Stop Transcription' : 'Start Transcription'}
        </button>
        <button @click=${this.exportToTxt} .disabled=${!this.transcribedText || !this.transcribedText.trim()}>Export to TXT</button>
      </div>
      <textarea
        readonly
        .value=${this.transcribedText}
        placeholder="Transcribed text will appear here..."
      ></textarea>
    `;
  }
}

// The custom element is defined in CheatingDaddyApp.js
// customElements.define('transcription-view', TranscriptionView);

export { TranscriptionView };
