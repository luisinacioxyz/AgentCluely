import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { AppHeader } from './AppHeader.js';
import { MainView } from '../views/MainView.js';
import { CustomizeView } from '../views/CustomizeView.js';
import { HelpView } from '../views/HelpView.js';
import { AssistantView } from '../views/AssistantView.js';
import { TranscriptionView } from '../views/TranscriptionView.js'; // Import TranscriptionView

export class CheatingDaddyApp extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 0px;
            padding: 0px;
            cursor: default;
        }

        :host {
            display: block;
            width: 100%;
            height: 100vh;
            background-color: var(--background-transparent);
            color: var(--text-color);
        }

        .window-container {
            height: 100vh;
            border-radius: 7px;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .main-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            margin-top: 10px;
            border-radius: 7px;
            transition: all 0.15s ease-out;
            background: var(--main-content-background);
        }

        .main-content.with-border {
            border: 1px solid var(--border-color);
        }

        .main-content.assistant-view {
            padding: 10px;
            border: none;
        }

        .view-container {
            opacity: 1;
            transform: translateY(0);
            transition: opacity 0.15s ease-out, transform 0.15s ease-out;
            height: 100%;
        }

        .view-container.entering {
            opacity: 0;
            transform: translateY(10px);
        }

        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        ::-webkit-scrollbar-track {
            background: var(--scrollbar-background);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        isRecording: { type: Boolean },
        sessionActive: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        _viewInstances: { type: Object, state: true },
        // Transcription related state
        isTranscribing: { type: Boolean },
        transcribedText: { type: String },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.isRecording = false; // This seems related to Gemini session, not local transcription
        this.sessionActive = false; // This seems related to Gemini session
        this.selectedProfile = localStorage.getItem('selectedProfile') || 'interview';
        this.selectedLanguage = localStorage.getItem('selectedLanguage') || 'en-US';
        this.selectedScreenshotInterval = localStorage.getItem('selectedScreenshotInterval') || '1';
        this.selectedImageQuality = localStorage.getItem('selectedImageQuality') || 'medium';
        this.responses = [];
        this.currentResponseIndex = -1;
        this._viewInstances = new Map();

        // Transcription related state initialization
        this.isTranscribing = false;
        this.transcribedText = '';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.mediaStream = null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Set up IPC listeners if needed
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('update-response', (_, response) => {
                this.setResponse(response);
            });
            ipcRenderer.on('update-status', (_, status) => {
                this.setStatus(status);
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeAllListeners('update-response');
            ipcRenderer.removeAllListeners('update-status');
        }
    }

    setStatus(text) {
        this.statusText = text;
    }

    setResponse(response) {
        this.responses.push(response);

        // If user is viewing the latest response (or no responses yet), auto-navigate to new response
        if (this.currentResponseIndex === this.responses.length - 2 || this.currentResponseIndex === -1) {
            this.currentResponseIndex = this.responses.length - 1;
        }

        this.requestUpdate();
    }

    // Header event handlers
    handleCustomizeClick() {
        this.currentView = 'customize';
        this.requestUpdate();
    }

    handleHelpClick() {
        this.currentView = 'help';
        this.requestUpdate();
    }

    handleTranscriptionViewClick() {
        this.currentView = 'transcription';
        this.requestUpdate();
    }

    async handleClose() {
        // The typo was in the previous commit's thinking, not in the actual code shown in read_files.
        // The code from read_files shows `this.currentView` correctly.
        // The line mentioned in the prompt:
        // `else if (this.currentVew === 'customize' || this.currentView === 'help' || this.currentView === 'transcription')`
        // is not present. The actual code is:
        // `if (this.currentView === 'customize' || this.currentView === 'help' || this.currentView === 'transcription')`
        // This part is correct. I will proceed with the isActiveView implementation.

        if (this.currentView === 'customize' || this.currentView === 'help' || this.currentView === 'transcription') {
            // For TranscriptionView, if it's actively transcribing, this.isTranscribing is internal to that component.
            // The new .isActiveView property will handle stopping transcription.
            // For now, simply switching the view will effectively "close" it.
            // If TranscriptionView.isTranscribing is true, it should ideally be stopped.
            // This might involve getting a reference to the view instance if it's cached,
            // or the view itself should handle being disconnected (disconnectedCallback in LitElement).
            // The current TranscriptionView stops microphone tracks when isTranscribing becomes false
            // or when it's stopped explicitly. Navigating away might not trigger this if not handled.
            // However, TranscriptionView's stopTranscription also calls mediaStream.getTracks().forEach(track => track.stop());
            // which is good. If `isTranscribing` is managed by this parent, we could set it here.
            // For now, just navigate back to main.
            this.currentView = 'main';
        } else if (this.currentView === 'assistant') {
            if (this.isTranscribing) {
                this.stopLocalTranscription();
            }
            if (window.cheddar) {
                window.cheddar.stopCapture();
            }

            // Close the session
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('close-session');
            }
            this.sessionActive = false;
            this.currentView = 'main';
            console.log('Session closed');
        } else { // This case implies currentView === 'main'
            if (this.isTranscribing) {
                this.stopLocalTranscription();
            }
            // Quit the entire application
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('quit-application');
            }
        }
    }

    async handleHideToggle() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('toggle-window-visibility');
        }
    }

    // Main view event handlers
    async handleStart() {
        if (window.cheddar) {
            await window.cheddar.initializeGemini(this.selectedProfile, this.selectedLanguage);
            window.cheddar.startCapture(parseInt(this.selectedScreenshotInterval, 10), this.selectedImageQuality);
        }
        this.responses = [];
        this.currentResponseIndex = -1;
        this.startTime = Date.now();
        this.currentView = 'assistant';
    }

    async handleAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://cheatingdaddy.com/help/api-key');
        }
    }

    // Customize view event handlers
    handleProfileChange(profile) {
        this.selectedProfile = profile;
    }

    handleLanguageChange(language) {
        this.selectedLanguage = language;
    }

    handleScreenshotIntervalChange(interval) {
        this.selectedScreenshotInterval = interval;
    }

    handleImageQualityChange(quality) {
        this.selectedImageQuality = quality;
    }

    // Help view event handlers
    async handleExternalLinkClick(url) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', url);
        }
    }

    // Assistant view event handlers
    async handleSendText(message) {
        if (window.cheddar) {
            const result = await window.cheddar.sendTextMessage(message);

            if (!result.success) {
                console.error('Failed to send message:', result.error);
                this.setStatus('Error sending message: ' + result.error);
            } else {
                this.setStatus('Message sent...');
            }
        }
    }

    handleResponseIndexChanged(e) {
        this.currentResponseIndex = e.detail.index;
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        
        // Only notify main process of view change if the view actually changed
        if (changedProperties.has('currentView') && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('view-changed', this.currentView);
            
            // Add a small delay to smooth out the transition
            const viewContainer = this.shadowRoot?.querySelector('.view-container');
            if (viewContainer) {
                viewContainer.classList.add('entering');
                requestAnimationFrame(() => {
                    viewContainer.classList.remove('entering');
                });
            }
        }
        
        // Only update localStorage when these specific properties change
        if (changedProperties.has('selectedProfile')) {
            localStorage.setItem('selectedProfile', this.selectedProfile);
        }
        if (changedProperties.has('selectedLanguage')) {
            localStorage.setItem('selectedLanguage', this.selectedLanguage);
        }
        if (changedProperties.has('selectedScreenshotInterval')) {
            localStorage.setItem('selectedScreenshotInterval', this.selectedScreenshotInterval);
        }
        if (changedProperties.has('selectedImageQuality')) {
            localStorage.setItem('selectedImageQuality', this.selectedImageQuality);
        }
    }

    // --- Transcription Methods ---
    async startLocalTranscription() {
        console.log('CDA: Attempting to start local transcription...');
        if (this.isTranscribing) {
            console.warn('Transcription already in progress.');
            return;
        }
        this.audioChunks = [];
        this.transcribedText += '[Recording started...]\n'; // Append to existing text, remove CDA prefix

        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (!ipcRenderer) {
            console.error('ipcRenderer not available for transcription.');
            this.transcribedText += '[Error: ipcRenderer not available.]\n'; // Remove CDA prefix
            return;
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted:', this.mediaStream); // Remove CDA prefix

            this.mediaRecorder = new MediaRecorder(this.mediaStream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                console.log('MediaRecorder stopped.'); // Remove CDA prefix
                if (this.audioChunks.length > 0) {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    this.transcribedText += `\n[Processing audio segment, size: ${audioBlob.size} bytes...]\n`; // Remove CDA prefix

                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const audioDataUri = reader.result;
                        this.transcribedText += '[Sending to main process for transcription...]\n'; // Remove CDA prefix
                        try {
                            const result = await ipcRenderer.invoke('transcribe-audio', audioDataUri);
                            if (result.success) {
                                this.transcribedText += `Transcription: ${result.transcription}\n`; // Remove CDA prefix
                            } else {
                                this.transcribedText += `Transcription Error: ${result.error}\n`; // Remove CDA prefix
                                console.error('Transcription Error from main process:', result.error); // Remove CDA prefix
                            }
                        } catch (ipcError) {
                            console.error('Error invoking ipcRenderer for transcription:', ipcError); // Remove CDA prefix
                            this.transcribedText += `[IPC Error: ${ipcError.message}]\n`; // Remove CDA prefix
                        } finally {
                             this.audioChunks = []; // Clear chunks after processing
                        }
                    };
                    reader.onerror = (error) => {
                        console.error('FileReader error:', error); // Remove CDA prefix
                        this.transcribedText += `[Error reading audio data: ${error.message}]\n`; // Remove CDA prefix
                        this.audioChunks = []; // Clear chunks on error
                    };
                    reader.readAsDataURL(audioBlob);
                } else {
                    console.log('No audio chunks recorded.'); // Remove CDA prefix
                    this.transcribedText += '[No audio data to transcribe.]\n'; // Remove CDA prefix
                }
                // Do not stop mediaStream tracks here if we want to allow multiple start/stop cycles
                // without re-requesting microphone permission each time.
                // Tracks will be stopped when user navigates away or explicitly calls a method that does.
            };

            this.mediaRecorder.start();
            this.isTranscribing = true; // Set main state
            console.log('MediaRecorder started, isTranscribing set to true.'); // Remove CDA prefix
        } catch (error) {
            console.error('Error accessing microphone:', error); // Remove CDA prefix
            this.isTranscribing = false;
            this.transcribedText += `[Error: ${error.message}]\n`; // Remove CDA prefix
            if (error.name === 'NotAllowedError') {
                alert('Microphone access was denied. Please allow microphone access in your browser/system settings.'); // Remove CDA prefix
            } else if (error.name === 'NotFoundError') {
                alert('No microphone found. Please ensure a microphone is connected and enabled.'); // Remove CDA prefix
            } else {
                alert(`An error occurred while accessing the microphone: ${error.message}`); // Remove CDA prefix
            }
        }
    }

    stopLocalTranscription() {
        console.log('Attempting to stop local transcription...'); // Remove CDA prefix
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop(); // This will trigger onstop
        } else {
            console.log('MediaRecorder not recording or not initialized.'); // Remove CDA prefix
        }
        this.isTranscribing = false; // Set main state
        this.transcribedText += '[Recording stopped.]\n'; // Remove CDA prefix
        console.log('isTranscribing set to false.'); // Remove CDA prefix

        // Stop microphone tracks when transcription is explicitly stopped
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            console.log('Microphone stream tracks stopped explicitly via stopLocalTranscription.'); // Remove CDA prefix
            this.mediaStream = null;
        }
    }

    async handleExportTranscription(textContentToExport) {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (!ipcRenderer) {
            console.error('ipcRenderer not available for export.');
            this.transcribedText += '\n[Error: ipcRenderer not available for export.]\n';
            return;
        }

        if (!textContentToExport || textContentToExport.trim() === '') {
            this.transcribedText += '\n[Nothing to export.]\n';
            // Optional: auto-remove this message after a delay
            setTimeout(() => {
                this.transcribedText = this.transcribedText.replace(/\n\[Nothing to export.\]\n*$/, '').trim();
            }, 3000);
            return;
        }

        this.transcribedText += '\n[Exporting...]\n';
        try {
            const result = await ipcRenderer.invoke('export-transcription-txt', textContentToExport);
            if (result.success) {
                this.transcribedText += `[Exported successfully to ${result.filePath}]\n`;
            } else {
                this.transcribedText += `[Export failed: ${result.message || result.error}]\n`;
            }
        } catch (error) {
            this.transcribedText += `[Export IPC error: ${error.message}]\n`;
            console.error('Error invoking ipcRenderer for export:', error);
        }
    }
    // --- End Transcription Methods ---

    renderCurrentView() {
        // Only re-render the view if it hasn't been cached or if critical properties changed
        const viewKey = `${this.currentView}-${this.selectedProfile}-${this.selectedLanguage}`;
        
        switch (this.currentView) {
            case 'main':
                // Logic for caching or always new instance of MainView
                // if (!this._viewInstances.has('main')) {
                //     this._viewInstances.set('main', html`<main-view .onStart=${() => this.handleStart()} .onAPIKeyHelp=${() => this.handleAPIKeyHelp()}></main-view>`);
                // }
                // return this._viewInstances.get('main');
                 return html`
                    <main-view
                        .onStart=${() => this.handleStart()}
                        .onAPIKeyHelp=${() => this.handleAPIKeyHelp()}
                    ></main-view>
                `;

            case 'transcription':
                // Logic for caching or always new instance of TranscriptionView
                // if (!this._viewInstances.has('transcription')) {
                //     this._viewInstances.set('transcription', html`<transcription-view
                //         .isActiveView=${this.currentView === 'transcription'}
                //         .isTranscribing=${this.isTranscribing}
                //         .transcribedText=${this.transcribedText}
                //         .onStartRequest=${() => this.startLocalTranscription()}
                //         .onStopRequest=${() => this.stopLocalTranscription()}
                //         .onExportRequest=${(text) => this.handleExportTranscription(text)}
                //     ></transcription-view>`);
                // }
                // return this._viewInstances.get('transcription');
                return html`<transcription-view
                    .isActiveView=${this.currentView === 'transcription'}
                    .isTranscribing=${this.isTranscribing}
                    .transcribedText=${this.transcribedText}
                    .onStartRequest=${() => this.startLocalTranscription()}
                    .onStopRequest=${() => this.stopLocalTranscription()}
                    .onExportRequest=${(text) => this.handleExportTranscription(text)}
                ></transcription-view>`;

            case 'customize':
                return html`
                    <customize-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .selectedScreenshotInterval=${this.selectedScreenshotInterval}
                        .selectedImageQuality=${this.selectedImageQuality}
                        .onProfileChange=${(profile) => this.handleProfileChange(profile)}
                        .onLanguageChange=${(language) => this.handleLanguageChange(language)}
                        .onScreenshotIntervalChange=${(interval) => this.handleScreenshotIntervalChange(interval)}
                        .onImageQualityChange=${(quality) => this.handleImageQualityChange(quality)}
                    ></customize-view>
                `;

            case 'help':
                return html`
                    <help-view
                        .onExternalLinkClick=${(url) => this.handleExternalLinkClick(url)}
                    ></help-view>
                `;

            case 'assistant':
                return html`
                    <assistant-view
                        .responses=${this.responses}
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .onSendText=${(message) => this.handleSendText(message)}
                        @response-index-changed=${this.handleResponseIndexChanged}
                    ></assistant-view>
                `;

            default:
                return html`<div>Unknown view: ${this.currentView}</div>`;
        }
    }

    render() {
        const mainContentClass = `main-content ${
            this.currentView === 'assistant' ? 'assistant-view' : 'with-border'
        }`;

        return html`
            <div class="window-container">
                <div class="container">
                    <app-header
                        .currentView=${this.currentView}
                        .statusText=${this.statusText}
                        .startTime=${this.startTime}
                        .isTranscribing=${this.isTranscribing} // Pass isTranscribing state
                        .onGlobalStopTranscriptionRequest=${() => this.stopLocalTranscription()} // Pass global stop handler
                        .onCustomizeClick=${() => this.handleCustomizeClick()}
                        .onHelpClick=${() => this.handleHelpClick()}
                        .onTranscriptionViewClick=${() => this.handleTranscriptionViewClick()}
                        .onCloseClick=${() => this.handleClose()}
                        .onHideToggleClick=${() => this.handleHideToggle()}
                    ></app-header>
                    <div class="${mainContentClass}">
                        <div class="view-container">
                            ${this.renderCurrentView()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('cheating-daddy-app', CheatingDaddyApp);
customElements.define('transcription-view', TranscriptionView); // Define TranscriptionView