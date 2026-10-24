import './pages.css';
import { requireSession, mountAccountMenu, request } from './client.js';
const user = await requireSession({admin: true});
mountAccountMenu(user);
const $ = selector => document.querySelector(selector);
let page = 1, busy = false;
const formatDate = seconds => seconds ? new Date(seconds * 1000).toLocaleString() : 'Never';
async function refresh() {
    if (busy) return; busy = true; $('#refresh-users').disabled = true;
    $('#previous-users').disabled = true; $('#next-users').disabled = true;
    try {
        const report = await request(`/api/admin/users?page=${page}`);
        for (const [id, key] of [['total-users','total_users'],['active-now','active_now'],['active-24h','active_24h'],['total-logins','total_logins']]) $(('#' + id)).textContent = report[key].toLocaleString();
        $('#users-table').replaceChildren();
        for (const person of report.users) {
            const row = document.createElement('tr');
            const identity = document.createElement('td');
            const name = document.createElement('strong'); name.textContent = person.name;
            const email = document.createElement('small'); email.textContent = person.email; identity.append(name, email); row.append(identity);
            for (const value of [person.role, person.provider === 'google' ? 'Google' : 'Email / password', person.online ? 'Active now' : 'Offline', formatDate(person.created_at), formatDate(person.last_seen), String(person.login_count)]) {
                const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
            }
            $('#users-table').append(row);
        }
        $('#activity-chart').replaceChildren();
        const max = Math.max(1, ...report.trend.map(day => day.users));
        for (const day of report.trend) {
            const column = document.createElement('div'); column.className = 'activity-day';
            const value = document.createElement('strong'); value.textContent = day.users;
            const bar = document.createElement('div'); bar.className = 'activity-bar'; bar.style.height = `${Math.max(2, day.users / max * 100)}px`;
            const label = document.createElement('small'); label.textContent = new Date(day.day + 'T12:00:00Z').toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'});
            column.setAttribute('aria-label', `${day.day}: ${day.users} active users`); column.append(value, bar, label); $('#activity-chart').append(column);
        }
        $('#users-page').textContent = `Page ${page} of ${Math.max(1, Math.ceil(report.total_users / report.page_size))}`;
        $('#user-range').textContent = `${report.total_users} account${report.total_users === 1 ? '' : 's'}`;
        $('#previous-users').disabled = page <= 1; $('#next-users').disabled = page * report.page_size >= report.total_users;
        $('#admin-status').textContent = `Updated ${formatDate(report.generated_at)} · refreshes every minute`;
    } catch (error) {
        $('#admin-status').textContent = error.message;
        if (error.status === 401 || error.status === 403) {
            $('#users-table').replaceChildren(); $('#activity-chart').replaceChildren();
            location.replace('/login.html?next=%2Fadmin.html');
        }
    } finally { busy = false; $('#refresh-users').disabled = false; }
}
$('#refresh-users').onclick = refresh;
$('#previous-users').onclick = () => { if (!busy && page > 1) { page--; refresh(); } };
$('#next-users').onclick = () => { if (!busy) { page++; refresh(); } };
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
