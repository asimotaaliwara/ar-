/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

// --- TYPE DEFINITIONS ---
interface InspectionReport {
    id: string;
    date: string;
    queen: 'yes' | 'no';
    disease: 'yes' | 'no';
    eggs: 'yes' | 'no';
    honeyStores: 'good' | 'sufficient' | 'low';
    feeding: 'yes' | 'no';
    feedingAmount?: string;
    notes?: string;
}

interface Hive {
    id: string;
    name: string;
    location: string;
    reports: InspectionReport[];
}

interface AppState {
    hives: Hive[];
}

// --- CONSTANTS & STATE ---
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });
const textModel = 'gemini-2.5-flash';
const visionModel = 'gemini-2.5-flash'; // gemini-2.5-flash is multimodal

let state: AppState = {
    hives: [],
};

const FAQ_DATA = [
    {
        q: "Ana arını pətəkdə tapa bilmirəm, nə etməliyəm?",
        a: "Sakit olun və pətəyi diqqətlə yoxlayın. Əgər ana arı yoxdursa, gündəlik yumurtaların olub-olmadığını yoxlayın. Yumurta varsa, arılar yeni ana yetişdirə bilər. Yumurta yoxdursa, yeni bir ana arı almalı və ya başqa pətəkdən yumurtalı çərçivə verməlisiniz."
    },
    {
        q: "Arılarım niyə aqressivdir?",
        a: "Aqressivliyin bir neçə səbəbi ola bilər: ana arının genetikası, qida azlığı, hava şəraiti (küləkli, soyuq), varroa gənəsi kimi zərərvericilər və ya pətəyin tez-tez narahat edilməsi. Səbəbi müəyyənləşdirmək üçün bu amilləri nəzərdən keçirin."
    },
    {
        q: "Varroa gənəsi ilə necə mübarizə aparmaq olar?",
        a: "Varroa ilə mübarizə arıçılığın vacib hissəsidir. Üzvi turşular (oksalik, formik), timol əsaslı preparatlar və ya apteklerde satılan xüsusi dərmanlardan istifadə edə bilərsiniz. Mübarizəni bal sağımından sonra və payızda aparmaq vacibdir."
    },
    {
        q: "Arı ailəsi oğul verməyə hazırlaşır, nə edim?",
        a: "Oğul vermənin qarşısını almaq üçün pətəkdə sıxlığı azaltmaq, yeni çərçivələr (mum) vermək və ana arı qəfəslərini (oğul qutucuqlarını) məhv etmək lazımdır. Əgər gecikmisinizsə, ailəni bölərək süni oğul yarada bilərsiniz."
    }
];

// --- DOM ELEMENTS ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function getElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element with id ${id} not found`);
    return el as T;
}

// --- APP INITIALIZATION ---
function initializeApp() {
    loadStateFromLocalStorage();
    setupEventListeners();
    navigateTo('hives-view');
}

// --- STATE MANAGEMENT ---
function loadStateFromLocalStorage() {
    const savedState = localStorage.getItem('beekeepingAppState');
    if (savedState) {
        state = JSON.parse(savedState);
    }
}

function saveStateToLocalStorage() {
    localStorage.setItem('beekeepingAppState', JSON.stringify(state));
}

// --- VIEW NAVIGATION ---
function navigateTo(viewId: string) {
    document.querySelectorAll<HTMLElement>('.view').forEach(v => v.classList.remove('active'));
    getElement(viewId).classList.add('active');

    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeButton = document.querySelector<HTMLButtonElement>(`.nav-btn[data-view="${viewId}"]`);
    activeButton?.classList.add('active');

    const headerTitle = getElement<HTMLHeadingElement>('header-title');
    headerTitle.textContent = activeButton?.querySelector('span')?.textContent || 'Arıçı Rəhbəri';

    // Refresh content when navigating to a view
    switch (viewId) {
        case 'hives-view':
            renderHivesView();
            break;
        case 'ai-view':
            // Content is static, no render needed on switch
            break;
        case 'image-view':
            renderImageView();
            break;
        case 'faq-view':
            renderFaqView();
            break;
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Navigation
    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view!));
    });

    // Modals
    const addHiveModal = getElement('add-hive-modal');
    const addInspectionModal = getElement('add-inspection-modal');
    
    getElement('add-hive-fab').addEventListener('click', () => openModal(addHiveModal));
    
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(addHiveModal);
            closeModal(addInspectionModal);
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === addHiveModal) closeModal(addHiveModal);
        if (event.target === addInspectionModal) closeModal(addInspectionModal);
    });

    // Forms
    getElement<HTMLFormElement>('add-hive-form').addEventListener('submit', handleAddHive);
    getElement<HTMLFormElement>('add-inspection-form').addEventListener('submit', handleAddInspection);

    // Dynamic listeners for inspection buttons will be added in renderHivesView

    // AI Advice
    getElement('get-ai-advice-btn').addEventListener('click', handleGetAIAdvice);
    
    // Image Analysis
    getElement('upload-image-btn').addEventListener('click', () => getElement('image-upload-input').click());
    getElement<HTMLInputElement>('image-upload-input').addEventListener('change', handleImagePreview);
    getElement('analyze-image-btn').addEventListener('click', handleAnalyzeImage);

    // Inspection form conditional field
    document.querySelectorAll<HTMLInputElement>('input[name="feeding"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const amountGroup = getElement('feeding-amount-group');
            amountGroup.style.display = target.value === 'yes' ? 'block' : 'none';
        });
    });
}

// --- RENDER FUNCTIONS ---

function renderHivesView() {
    const list = getElement('hives-list');
    list.innerHTML = '';
    if (state.hives.length === 0) {
        list.innerHTML = `<p style="text-align:center; color: #757575;">Heç bir pətək yoxdur. Başlamaq üçün '+' düyməsinə basın.</p>`;
        return;
    }

    state.hives.forEach(hive => {
        const card = document.createElement('div');
        card.className = 'hive-card';
        card.innerHTML = `
            <div class="hive-card-header">
                <div>
                    <h2>${hive.name}</h2>
                    <p>${hive.location}</p>
                </div>
                <div class="hive-card-actions">
                    <button class="add-inspection-btn" data-hive-id="${hive.id}">Yoxlama Əlavə Et</button>
                </div>
            </div>
            <div class="inspections-container">
                ${hive.reports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(report => `
                    <button class="accordion-header">${new Date(report.date).toLocaleDateString('az-AZ', { day: '2-digit', month: 'long', year: 'numeric' })}</button>
                    <div class="accordion-panel">
                        <ul>
                            <li><strong>Ana Arı:</strong> ${report.queen === 'yes' ? 'Göründü' : 'Görünmədi'}</li>
                            <li><strong>Xəstəlik:</strong> ${report.disease === 'yes' ? 'Əlamət var' : 'Əlamət yoxdur'}</li>
                            <li><strong>Yumurta:</strong> ${report.eggs === 'yes' ? 'Var' : 'Yoxdur'}</li>
                            <li><strong>Bal Ehtiyatı:</strong> ${report.honeyStores}</li>
                            <li><strong>Yemləmə:</strong> ${report.feeding === 'yes' ? `Bəli (${report.feedingAmount || 'qeyd edilməyib'})` : 'Xeyr'}</li>
                            ${report.notes ? `<li><strong>Qeydlər:</strong> ${report.notes}</li>` : ''}
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;
        list.appendChild(card);
    });
    
    // Add event listeners for newly created buttons
    document.querySelectorAll<HTMLButtonElement>('.add-inspection-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            getElement<HTMLInputElement>('inspection-hive-id').value = btn.dataset.hiveId!;
            openModal(getElement('add-inspection-modal'));
        });
    });

    document.querySelectorAll<HTMLButtonElement>('.accordion-header').forEach(accordion => {
        accordion.addEventListener('click', function() {
            this.classList.toggle('active');
            const panel = this.nextElementSibling as HTMLElement;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = '';
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        });
    });
}

function renderFaqView() {
    const list = getElement('faq-list');
    list.innerHTML = FAQ_DATA.map(item => `
        <button class="accordion-header">${item.q}</button>
        <div class="accordion-panel">
            <p>${item.a}</p>
        </div>
    `).join('');

    document.querySelectorAll<HTMLButtonElement>('#faq-list .accordion-header').forEach(accordion => {
        accordion.addEventListener('click', function() {
            this.classList.toggle('active');
            const panel = this.nextElementSibling as HTMLElement;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = '';
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        });
    });
}

function renderImageView() {
    const select = getElement<HTMLSelectElement>('hive-select-for-image');
    select.innerHTML = state.hives.map(hive => `<option value="${hive.id}">${hive.name}</option>`).join('');
     if (state.hives.length === 0) {
        select.innerHTML = '<option disabled>Zəhmət olmasa, əvvəlcə pətək əlavə edin</option>';
        (getElement('upload-image-btn') as HTMLButtonElement).disabled = true;
    } else {
         (getElement('upload-image-btn') as HTMLButtonElement).disabled = false;
    }
}

// --- HANDLER FUNCTIONS ---

function handleAddHive(e: SubmitEvent) {
    e.preventDefault();
    const name = getElement<HTMLInputElement>('hive-name').value;
    const location = getElement<HTMLInputElement>('hive-location').value;
    const newHive: Hive = {
        id: `hive_${Date.now()}`,
        name,
        location,
        reports: [],
    };
    state.hives.push(newHive);
    saveStateToLocalStorage();
    renderHivesView();
    closeModal(getElement('add-hive-modal'));
    (e.target as HTMLFormElement).reset();
}

function handleAddInspection(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const hiveId = getElement<HTMLInputElement>('inspection-hive-id').value;
    const hive = state.hives.find(h => h.id === hiveId);
    if (!hive) return;

    const newReport: InspectionReport = {
        id: `report_${Date.now()}`,
        date: new Date().toISOString(),
        queen: form.querySelector<HTMLInputElement>('input[name="queen"]:checked')!.value as 'yes' | 'no',
        disease: form.querySelector<HTMLInputElement>('input[name="disease"]:checked')!.value as 'yes' | 'no',
        eggs: form.querySelector<HTMLInputElement>('input[name="eggs"]:checked')!.value as 'yes' | 'no',
        honeyStores: getElement<HTMLSelectElement>('honey-stores').value as 'good' | 'sufficient' | 'low',
        feeding: form.querySelector<HTMLInputElement>('input[name="feeding"]:checked')!.value as 'yes' | 'no',
        feedingAmount: getElement<HTMLInputElement>('feeding-amount').value,
        notes: getElement<HTMLTextAreaElement>('general-notes').value,
    };

    hive.reports.push(newReport);
    saveStateToLocalStorage();
    renderHivesView();
    closeModal(getElement('add-inspection-modal'));
    form.reset();
    getElement('feeding-amount-group').style.display = 'none';
}

async function handleGetAIAdvice() {
    if (state.hives.length === 0) {
        alert("Analiz etmək üçün heç bir pətək məlumatı yoxdur.");
        return;
    }
    showLoading(true);
    const resultContainer = getElement('ai-advice-result');
    resultContainer.textContent = '';
    
    try {
        const prompt = `
            You are an expert beekeeping consultant. Analyze the following data from a beekeeper's hives and provide a summary of the apiary's health, identify potential problems, and suggest actionable solutions. The language of your response must be Azerbaijani.

            Here is the data:
            ${JSON.stringify(state.hives, null, 2)}
        `;

        const response = await ai.models.generateContent({
          model: textModel,
          contents: prompt,
        });

        resultContainer.textContent = response.text;

    } catch (error) {
        console.error("AI Advice Error:", error);
        resultContainer.textContent = "Analiz zamanı xəta baş verdi. Zəhmət olmasa, bir az sonra yenidən cəhd edin.";
    } finally {
        showLoading(false);
    }
}

function handleImagePreview(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = getElement<HTMLImageElement>('image-preview');
            preview.src = e.target?.result as string;
            preview.style.display = 'block';
            getElement<HTMLButtonElement>('analyze-image-btn').disabled = false;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function handleAnalyzeImage() {
    const input = getElement<HTMLInputElement>('image-upload-input');
    if (!input.files || input.files.length === 0) {
        alert("Zəhmət olmasa, analiz etmək üçün bir şəkil seçin.");
        return;
    }

    showLoading(true);
    const resultContainer = getElement('image-analysis-result');
    resultContainer.textContent = '';
    
    try {
        const file = input.files[0];
        const base64Image = await fileToBase64(file);
        
        const imagePart = {
            inlineData: {
                mimeType: file.type,
                data: base64Image,
            },
        };
        const textPart = {
            text: "You are an expert beekeeper. Analyze this image of a beehive frame or bees. Identify any visible issues like diseases (e.g., Varroa mites, foulbrood signs), the presence and health of the queen bee if visible, the brood pattern, honey and pollen stores. Provide a detailed report and recommendations. The language of your response must be Azerbaijani.",
        };

        const response = await ai.models.generateContent({
          model: visionModel,
          contents: { parts: [imagePart, textPart] },
        });

        resultContainer.textContent = response.text;

    } catch (error) {
        console.error("Image Analysis Error:", error);
        resultContainer.textContent = "Şəkil analizi zamanı xəta baş verdi. Zəhmət olmasa, bir az sonra yenidən cəhd edin.";
    } finally {
        showLoading(false);
    }
}

// --- UTILITY FUNCTIONS ---

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // remove the "data:image/jpeg;base64," part
            resolve(result.split(',')[1]);
        };
        reader.onerror = error => reject(error);
    });
}

function openModal(modal: HTMLElement) {
    modal.classList.add('show');
}

function closeModal(modal: HTMLElement) {
    modal.classList.remove('show');
}

function showLoading(isLoading: boolean) {
    const spinner = getElement('loading-spinner');
    spinner.style.display = isLoading ? 'flex' : 'none';
}
