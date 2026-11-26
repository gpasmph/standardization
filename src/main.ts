import './styles/main.css';
import './styles/screens.css';
import { onChange, onClick, onInput, onSubmit } from './actions';
import { initAuth } from './auth';
import { mountNav } from './components/nav';
import { missingConfig } from './lib/supabase';
import { render } from './render';

if (missingConfig) {
  document.body.classList.add('anon');
  document.querySelector('#main')!.innerHTML = `<div class="login"><div class="panel">
    <h1>Setup needed</h1>
    <p class="sub">Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_PUBLISHABLE_KEY</b> to the <b>.env</b> file, then restart <b>npm run dev</b>.</p></div></div>`;
} else {
  mountNav();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  render();
  initAuth();
}
