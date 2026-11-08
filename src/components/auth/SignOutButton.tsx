/** Small sign-out control: a form POST to /auth/signout, so it works without client JavaScript. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="btn">
        <span>Sign out</span>
        <span className="thai text-sm font-semibold text-muted">ออกจากระบบ</span>
      </button>
    </form>
  );
}
