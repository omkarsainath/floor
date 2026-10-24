import { projectStorage } from '../auth/storage.js';
import { DRAFT_KEY, DRAFT_ARCHIVE_KEY, BACKUP_KEY, validatePlan, saveDraft, deleteSavedDraft } from '../builder/model.js';
import { downloadBlob, planFilename } from '../builder/download.js';
import { parseLayout } from '../loaders/jsonLoader.js';
import { createProjectFile, readProjectFile, openProjectFile, PREVIOUS_PROJECT_KEY } from '../state/projectFiles.js';

export function setupSavedFilesPanel(button, { onDraftDeleted = () => {} } = {}) {
    const style = document.createElement('style');
    style.textContent = `
        #saved-files-dialog { box-sizing:border-box; width:min(580px,calc(100vw - 32px)); max-height:85vh; overflow:auto; padding:24px; border:1px solid #d3dceb; border-radius:16px; background:#fff; color:#172033; font:15px/1.5 system-ui; box-shadow:0 15px 60px #0004; }
        #saved-files-dialog::backdrop { background:#11182799; }
        #saved-files-dialog .saved-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        #saved-files-dialog h2 { margin:0; font-size:24px; }
        #saved-files-dialog h3 { margin:0; font-size:16px; overflow-wrap:anywhere; }
        #saved-files-dialog p { margin:8px 0 14px; }
        #saved-files-dialog .saved-entry { padding:16px; margin:12px 0; border:1px solid #dce2ed; border-radius:10px; background:#f6f8fc; }
        #saved-files-dialog .saved-actions { display:flex; flex-wrap:wrap; gap:8px; }
        #saved-files-dialog button, #saved-files-dialog .saved-link { display:inline-block; box-sizing:border-box; margin:0; padding:9px 14px; min-height:42px; border:1px solid #c2cddd; border-radius:8px; background:#4054d5; color:white; text-decoration:none; font:inherit; cursor:pointer; }
        #saved-files-dialog #saved-files-close { background:white; color:#243858; }
        #saved-files-dialog .saved-delete { background:#fff; color:#b42318; border-color:#efb5b0; }
        #saved-files-dialog .saved-delete:hover { background:#fff0ee; }
        #saved-files-dialog label { display:block; font-weight:600; margin-top:20px; }
        #saved-files-dialog input { display:block; max-width:100%; margin:10px 0; font:inherit; }
        #saved-files-dialog .saved-error { color:#a32828; }
        #saved-files-dialog :focus-visible { outline:3px solid #5260e8; outline-offset:3px; }
    `;
    document.head.append(style);
    const dialog = document.createElement('dialog');
    dialog.id = 'saved-files-dialog';
    dialog.setAttribute('aria-labelledby', 'saved-files-title');
    dialog.innerHTML = `
        <div class="saved-heading"><h2 id="saved-files-title">Saved Files</h2><button id="saved-files-close" type="button">Close</button></div>
        <p>Your projects and 2D plans are saved in this browser on this device.</p>
        <div id="saved-files-list"></div>
        <label for="saved-files-input">Open a downloaded project backup</label>
        <p>Downloaded backups are usually in your Downloads folder. Choose an editable 2D .json backup or a .project.json backup.</p>
        <input id="saved-files-input" type="file" accept=".json,application/json">
        <div id="saved-files-preview"></div>
        <p id="saved-files-status" role="status" aria-live="polite"></p>
    `;
    document.body.append(dialog);
    for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => event.stopPropagation());
    const find = selector => dialog.querySelector(selector);
    const status = message => { find('#saved-files-status').textContent = message; };
    const summary = layout => `${layout.rooms.length} rooms · ${layout.walls.length} walls · ${layout.objects.length} items`;
    const entry = (parent, title, detail, label, action) => {
        const card = document.createElement('section');
        card.className = 'saved-entry';
        const heading = document.createElement('h3');
        heading.textContent = title;
        const description = document.createElement('p');
        description.textContent = detail;
        const control = document.createElement(typeof action === 'string' ? 'a' : 'button');
        control.textContent = label;
        if (typeof action === 'string') { control.href = action; control.className = 'saved-link'; }
        else { control.type = 'button'; control.onclick = action; }
        const actions = document.createElement('div');
        actions.className = 'saved-actions';
        actions.append(control);
        card.append(heading, description, actions);
        parent.append(card);
        return card;
    };
    const addDelete = (card, name, remove) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'saved-delete';
        control.textContent = 'Delete';
        control.setAttribute('aria-label', `Delete ${name}`);
        control.onclick = () => {
            if (!confirm(`Delete “${name}” from this browser? Downloaded backup files will stay on your computer.`)) return;
            try {
                remove();
                render();
                status(`Deleted “${name}”.`);
                find('#saved-files-close').focus();
            } catch (error) { status(`Could not delete this saved file: ${error.message}`); }
        };
        card.querySelector('.saved-actions').append(control);
    };
    const draftEntry = (parent, value, detail) => {
        const plan = validatePlan(value);
        const card = entry(parent, plan.name || '2D plan', `${detail} · ${plan.rooms.length} rooms · ${plan.objects.length} items`, 'Continue in 2D', `/builder.html?plan=${encodeURIComponent(plan.id)}`);
        const download = document.createElement('button');
        download.textContent = 'Download backup';
        download.onclick = () => downloadBlob(new Blob([JSON.stringify(plan, null, 2)], {type:'application/json'}), `${planFilename(plan)}.json`);
        card.querySelector('.saved-actions').append(download);
        addDelete(card, plan.name || '2D plan', () => {
            deleteSavedDraft(plan.id);
            onDraftDeleted(plan.id);
        });
    };
    const open = project => {
        try {
            const raw = projectStorage.getItem('preciseFloorplan');
            const layout = raw ? parseLayout(JSON.parse(raw)) : { rooms: [], walls: [], objects: [] };
            const current = createProjectFile(layout, layout.projectName || 'Previous project');
            openProjectFile(project, current);
            location.href = '/index.html';
        } catch (error) { status(`Could not open this project: ${error.message}`); }
    };
    const render = () => {
        const list = find('#saved-files-list');
        list.replaceChildren();
        const read = (key, label, show) => {
            try {
                const raw = projectStorage.getItem(key);
                if (raw) show(JSON.parse(raw));
            } catch (error) {
                const warning = document.createElement('p');
                warning.className = 'saved-error';
                warning.textContent = `${label} could not be read: ${error.message}`;
                list.append(warning);
            }
        };
        read('preciseFloorplan', 'Current 3D project', value => {
            const layout = parseLayout(value);
            const timestamp = Number(projectStorage.getItem('floorplanTimestamp'));
            const date = new Date(timestamp);
            const saved = timestamp > 0 && !Number.isNaN(date.getTime()) ? ` · Saved ${date.toLocaleString()}` : '';
            const name = layout.projectName || 'Current 3D project';
            const card = entry(list, name, `${summary(layout)}${saved}`, 'Open in 3D', '/index.html');
            addDelete(card, name, () => {
                projectStorage.removeItem('preciseFloorplan');
                // A stale timestamp is harmless if cleanup is unavailable.
                try { projectStorage.removeItem('floorplanTimestamp'); } catch { /* The project was removed. */ }
            });
        });
        read(DRAFT_KEY, '2D draft', value => {
            draftEntry(list, value, 'Current 2D draft');
        });
        read(DRAFT_ARCHIVE_KEY, 'Saved 2D plans', entries => {
            if (!Array.isArray(entries)) throw Error('Invalid saved plans list.');
            let currentId;
            try { currentId = JSON.parse(projectStorage.getItem(DRAFT_KEY) || 'null')?.id; } catch { /* Still show archived plans when the current draft is unreadable. */ }
            for (const saved of entries) {
                if (saved.plan.id === currentId) continue;
                draftEntry(list, saved.plan, 'Saved 2D plan');
            }
        });
        read(PREVIOUS_PROJECT_KEY, 'Previous project', value => {
            const project = readProjectFile(value);
            const card = entry(list, `Previous project: ${project.name}`, `${summary(project.layout)}. Opening keeps your current project as the previous project.`, 'Restore in 3D', () => open(project));
            addDelete(card, `Previous project: ${project.name}`, () => projectStorage.removeItem(PREVIOUS_PROJECT_KEY));
        });
        read(BACKUP_KEY, 'Project saved before building', value => {
            const layout = parseLayout(value);
            const project = createProjectFile(layout, layout.projectName || 'Project saved before building');
            const card = entry(list, project.name, `${summary(layout)}. Saved before switching to a different 2D plan.`, 'Restore in 3D', () => open(project));
            addDelete(card, project.name, () => projectStorage.removeItem(BACKUP_KEY));
        });
        if (!list.querySelector('.saved-entry')) {
            const empty = document.createElement('p');
            empty.textContent = 'No readable plans saved in this browser yet. Build a 2D plan or open a downloaded backup below. If you saved elsewhere, use the same browser and address where you saved it.';
            list.append(empty);
        }
    };
    button.onclick = () => {
        status('');
        find('#saved-files-input').value = '';
        find('#saved-files-preview').replaceChildren();
        render();
        dialog.showModal();
    };
    find('#saved-files-close').onclick = () => dialog.close();
    let fileSelection = 0;
    find('#saved-files-input').onchange = async event => {
        const selection = ++fileSelection;
        const preview = find('#saved-files-preview');
        preview.replaceChildren();
        status('');
        const file = event.target.files[0];
        if (!file) return;
        try {
            const value = JSON.parse(await file.text());
            if (selection !== fileSelection || !dialog.open) return;
            if (value?.format === 'ai-3d-project') {
                const project = readProjectFile(value);
                entry(preview, project.name, `${summary(project.layout)}. Opening keeps your current project as the previous project.`, 'Open this project', () => open(project));
            } else {
                const plan = validatePlan(value);
                entry(preview, plan.name || '2D plan', `${plan.rooms.length} rooms · ${plan.objects.length} items`, 'Open in 2D', () => {
                    try { saveDraft(plan); location.href = `/builder.html?plan=${encodeURIComponent(plan.id)}`; }
                    catch (error) { status(`Could not open this plan: ${error.message}`); }
                });
            }
        } catch (error) { if (selection === fileSelection) status(`Could not read this backup: ${error.message}`); }
    };
    dialog.addEventListener('close', () => { fileSelection++; });
    window.addEventListener('storage', () => { if (dialog.open) render(); });
    return { dialog };
}
