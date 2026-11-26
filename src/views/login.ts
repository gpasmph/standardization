const EYE = `<svg class="i-eye" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg class="i-eye-off" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

export const vLogin = (): string => `
  <div class="auth">
    <section class="auth-brand">
      <span class="logo">M</span>
      <h2>MPH Item<br>Standardization</h2>
      <p>One place to turn hospital item descriptions into standard MPH items.</p>
      <ul>
        <li>Check the MPH master first, so no duplicate code is created</li>
        <li>Build short and long descriptions from the attribute guides</li>
        <li>QA approval with every status change logged</li>
      </ul>
    </section>
    <section class="auth-form-wrap">
      <form id="login" class="auth-card" autocomplete="on">
        <header class="auth-head">
          <h1>Welcome back</h1>
          <p class="sub">Sign in with the account the admin created for you.</p>
        </header>
        <div class="auth-field">
          <label class="f" for="email">Email</label>
          <input type="email" id="email" name="email" autocomplete="username" placeholder="name@pasia.org" autofocus required>
        </div>
        <div class="auth-field">
          <label class="f" for="password">Password</label>
          <div class="pw">
            <input type="password" id="password" name="password" autocomplete="current-password" placeholder="Enter your password" required>
            <button class="pw-toggle" type="button" data-togglepw="password" aria-label="Show password" aria-pressed="false" title="Show password">${EYE}${EYE_OFF}</button>
          </div>
        </div>
        <button class="btn primary block" type="submit">Sign in</button>
        <p class="hint">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </section>
  </div>`;
