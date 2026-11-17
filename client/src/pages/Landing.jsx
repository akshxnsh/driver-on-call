import { Link } from 'react-router-dom';

const STEPS = [
  ['Tell us where and when', 'Set your pickup place and the time you need a driver, from and to.'],
  ['Pick a verified driver', 'See who is free near you with their price, rating and distance.'],
  ['Ride in your own car', 'The driver comes to you and drives your car. You pay them directly.'],
];

const REASONS = [
  ['Checked before listed', 'Every driver\'s licence and ID are reviewed by our team before they appear.'],
  ['Clear prices', 'Drivers set their own rates. You see the total before you send a request.'],
  ['Ratings you can trust', 'Only people who actually booked can leave a review.'],
  ['Talk first, share later', 'Chat in the app. Phone numbers are shared only once the driver accepts.'],
];

const USES = ['A long drive home', 'Airport pick-up', 'A day of shopping', 'Family trips', 'Hospital visits', 'A night out'];

/** What a visitor sees before signing in. The real app opens only after sign-in. */
export default function Landing() {
  return (
    <>
      <section className="land-hero">
        <h1>Need a driver for your own car?</h1>
        <p>DOC connects you with verified, independent drivers near you. Book one by the hour, day or week. They come to you and drive.</p>
        <div className="actions">
          <Link to="/login" className="btn btn-primary btn-lg">Get started</Link>
          <Link to="/login" state={{ from: '/driver' }} className="btn btn-ghost btn-lg">I am a driver</Link>
        </div>
        <p className="land-note">Free to sign in with Google. No payment is taken in the app.</p>
      </section>

      <section className="land-section">
        <h2>How it works</h2>
        <ol className="land-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}><b>{title}</b><span>{text}</span></li>
          ))}
        </ol>
      </section>

      <section className="land-section">
        <h2>Good for</h2>
        <ul className="land-uses">{USES.map((u) => <li key={u}>{u}</li>)}</ul>
      </section>

      <section className="land-section">
        <h2>Why DOC</h2>
        <ul className="land-reasons">
          {REASONS.map(([title, text]) => (
            <li key={title}><b>{title}</b><span>{text}</span></li>
          ))}
        </ul>
      </section>

      <section className="land-driver">
        <div>
          <h2>Are you a driver?</h2>
          <p>Get hired by car owners near you. Set your own rates and working hours. Register, we verify your documents, and requests start coming in.</p>
        </div>
        <Link to="/login" state={{ from: '/driver' }} className="btn btn-primary btn-lg">Register as a driver</Link>
      </section>
    </>
  );
}
