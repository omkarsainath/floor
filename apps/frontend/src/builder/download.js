export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function planFilename(plan) {
    return String(plan.name || 'my-2d-plan').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'my-2d-plan';
}

// Export the whole drawing, independent of the editor's zoom or selection.
export function floorPlanSVG(svg, plan) {
    if (!plan.rooms.length) throw Error('Add a room before downloading a floor plan image.');
    const copy = svg.cloneNode(true);
    copy.removeAttribute('id');
    copy.removeAttribute('tabindex');
    copy.removeAttribute('role');
    copy.removeAttribute('aria-label');
    copy.querySelectorAll('defs, [fill="url(#grid)"], .resize-handle, [data-editor-only]').forEach(node => node.remove());
    copy.querySelectorAll('.selected').forEach(node => node.classList.remove('selected'));
    const bounds = plan.rooms.map(r => ({left:r.x, top:r.y, right:r.x+r.w, bottom:r.y+r.d}));
    for (const item of plan.objects) {
        const angle = item.rotation || 0;
        const w = Math.abs(Math.cos(angle))*item.w + Math.abs(Math.sin(angle))*item.d;
        const h = Math.abs(Math.sin(angle))*item.w + Math.abs(Math.cos(angle))*item.d;
        bounds.push({left:item.x-w/2, top:item.y-h/2, right:item.x+w/2, bottom:item.y+h/2});
    }
    const x = Math.min(...bounds.map(b=>b.left))-.5, y = Math.min(...bounds.map(b=>b.top))-.5;
    const width = Math.max(...bounds.map(b=>b.right))-x+.5, height = Math.max(...bounds.map(b=>b.bottom))-y+.5;
    const scale = 2400/Math.max(width,height);
    copy.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    copy.setAttribute('width', Math.max(1, Math.round(width*scale)));
    copy.setAttribute('height', Math.max(1, Math.round(height*scale)));
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{font-family:Arial,sans-serif;fill:#34435c}';
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key,value] of Object.entries({x,y,width,height,fill:'white'})) background.setAttribute(key,value);
    copy.prepend(style, background);
    return new Blob([new XMLSerializer().serializeToString(copy)], {type:'image/svg+xml;charset=utf-8'});
}

export async function floorPlanPNG(blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return await new Promise((resolve,reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('Could not create the floor plan image.')), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
}
