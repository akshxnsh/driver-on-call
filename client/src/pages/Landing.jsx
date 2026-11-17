import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, MessageCircle, ShieldCheck, Star, UserCheck, Wallet, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { GridPattern } from '@/components/ui/grid-pattern';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { BorderBeam } from '@/components/ui/border-beam';
import { NumberTicker } from '@/components/ui/number-ticker';

const STEPS = [
  [MapPin, 'Tell us where and when', 'Set your pickup place and the time you need a driver, from and to.'],
  [UserCheck, 'Pick a verified driver', 'See who is free near you, with their price, rating and distance.'],
  [Car, 'Ride in your own car', 'The driver comes to you and drives your car. You pay them directly.'],
];

const REASONS = [
  [ShieldCheck, 'Checked before listed', "Every driver's licence and ID are reviewed by our team before they appear."],
  [Wallet, 'Clear prices', 'Drivers set their own rates. You see the total before you send a request.'],
  [Star, 'Ratings you can trust', 'Only people who actually booked can leave a review.'],
  [MessageCircle, 'Talk first, share later', 'Chat in the app. Phone numbers are shared only once the driver accepts.'],
];

const USES = ['A long drive home', 'Airport pick-up', 'A day of shopping', 'Family trips', 'Hospital visits', 'A night out'];

/** A static picture of what a search result looks like, so the page explains the product at a glance. */
function PreviewCard() {
  return (
    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_20px_60px_-24px_rgba(11,93,77,0.35)]">
      <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Thu 19 Nov · 10:00 am to 2:30 pm</span>
        <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">2 drivers free</span>
      </div>
      {[['Ramesh K.', '4.9', '12 yrs', '0.8 km', 810, true], ['Farhan A.', '4.7', '7 yrs', '1.7 km', 765, true]].map(([name, rating, yrs, km, price, on], i) => (
        <div key={name} className={`flex items-center gap-3 rounded-xl border border-border p-3 ${i ? 'mt-2 opacity-70' : ''}`}>
          <span className="grid size-11 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{name[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              {name}
              <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />{rating}</span>
              <span className="whitespace-nowrap">{yrs}</span>
              <span className="whitespace-nowrap">{km}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-extrabold tabular-nums">₹{on && i === 0 ? <NumberTicker value={price} delay={0.6} /> : price}</div>
            <div className="text-[11px] text-muted-foreground">4 h 30 min</div>
          </div>
        </div>
      ))}
      <BorderBeam size={120} duration={7} colorFrom="#0b5d4d" colorTo="#7fd1b9" />
    </div>
  );
}

/** What a visitor sees before signing in. The real app opens only after sign-in. */
export default function Landing() {
  return (
    <div className="pb-8">
      <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-card px-6 py-12 md:px-12 md:py-20">
        <GridPattern
          width={44}
          height={44}
          className="-z-10 fill-transparent stroke-neutral-300/60 [mask-image:radial-gradient(520px_circle_at_30%_20%,white,transparent)]"
        />
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <BlurFade delay={0.05}>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                <AnimatedShinyText className="mx-0 font-medium">Every driver checked before listed</AnimatedShinyText>
              </div>
            </BlurFade>
            <BlurFade delay={0.15}>
              <h1 className="mt-6 max-w-xl text-[clamp(2.3rem,6vw,3.9rem)] leading-[1.04] font-extrabold tracking-tight text-foreground">
                Need a driver for your own car?
              </h1>
            </BlurFade>
            <BlurFade delay={0.25}>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
                DOC connects you with verified, independent drivers near you. Book one by the hour, day or week. They come to you and drive.
              </p>
            </BlurFade>
            <BlurFade delay={0.35}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="group h-12 rounded-full px-7 text-base font-bold shadow-sm transition-transform active:scale-[0.97]">
                  <Link to="/login">
                    Get started
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full px-7 text-base font-bold transition-transform active:scale-[0.97]">
                  <Link to="/login" state={{ from: '/driver' }}>I am a driver</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Free to sign in with Google. No payment is taken in the app.</p>
            </BlurFade>
          </div>
          <BlurFade delay={0.3} direction="up" offset={18} className="flex justify-center lg:justify-end">
            <PreviewCard />
          </BlurFade>
        </div>
      </section>

      <section className="py-16">
        <BlurFade inView>
          <h2 className="mb-8 text-2xl font-extrabold tracking-tight">How it works</h2>
        </BlurFade>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {STEPS.map(([Icon, title, text], i) => (
            <li key={title} className="h-full">
              <BlurFade inView delay={i * 0.1} className="h-full">
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(20,33,29,0.35)]">
                <span className="mb-5 grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Step {i + 1}</div>
                <div className="mt-1 text-lg font-bold">{title}</div>
                <p className="mt-2 text-muted-foreground">{text}</p>
              </div>
              </BlurFade>
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-16">
        <BlurFade inView>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Good for</h2>
        </BlurFade>
        <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
          {USES.map((u, i) => (
            <li key={u}>
              <BlurFade inView delay={i * 0.05}>
              <span className="block rounded-full border border-border bg-card px-5 py-2.5 font-semibold transition-colors duration-300 hover:border-primary hover:bg-accent hover:text-accent-foreground">{u}</span>
              </BlurFade>
            </li>
          ))}
        </ul>
      </section>

      <section className="pb-16">
        <BlurFade inView>
          <h2 className="mb-8 text-2xl font-extrabold tracking-tight">Why DOC</h2>
        </BlurFade>
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {REASONS.map(([Icon, title, text], i) => (
            <li key={title} className="h-full">
              <BlurFade inView delay={i * 0.08} className="h-full">
              <div className="flex h-full gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-26px_rgba(20,33,29,0.35)]">
                <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <div className="text-lg font-bold">{title}</div>
                  <p className="mt-1 text-muted-foreground">{text}</p>
                </div>
              </div>
              </BlurFade>
            </li>
          ))}
        </ul>
      </section>

      <BlurFade inView>
        <section className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground md:px-12">
          <GridPattern
            width={44}
            height={44}
            className="fill-transparent stroke-white/10 [mask-image:radial-gradient(420px_circle_at_85%_10%,white,transparent)]"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="text-3xl font-extrabold tracking-tight">Are you a driver?</h2>
              <p className="mt-3 text-lg text-white/80">
                Get hired by car owners near you. Set your own rates and working hours. Register, we verify your documents, and requests start coming in.
              </p>
            </div>
            <Button asChild className="group h-12 rounded-full bg-white px-7 text-base font-bold text-primary shadow-sm hover:bg-white/90 active:scale-[0.97]">
              <Link to="/login" state={{ from: '/driver' }}>
                Register as a driver
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}
