import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, FileText, Link2, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import './PublicPages.css';

const steps = [
  { number: '01', icon: FileText, title: 'Make practice purposeful.', text: 'Choose your topics, level and difficulty. Build a paper with worked solutions and a clear marking rubric.' },
  { number: '02', icon: Link2, title: 'Keep it simple for students.', text: 'Share a paper link. Students can write directly on the page or attach handwritten working, without an account.' },
  { number: '03', icon: ShieldCheck, title: 'Give every step its due.', text: 'Review the working, method marks and feedback. You decide what is approved and when results are released.' },
];
const questions = [
  ['Who is MethodMark for?', 'MethodMark is built for secondary mathematics tutors in Singapore, with Mathematics and Additional Mathematics practice organised by school year, subject level and topic.'],
  ['Do my students need an account?', 'No. Students open the practice-paper link shared by their tutor and use their student code. Tutor accounts are the only accounts needed.'],
  ['Does AI decide the final mark?', 'You always have the final say. The planned AI marking workflow proposes method and accuracy marks, flags uncertain working, and requires your review before any result is released. AI marking is still in development.'],
  ['What can I try today?', 'Create a tutor account to build papers from the connected question bank and preview writing directly on a paper. Paper sharing, submissions and analytics currently use browser-local sample data.'],
];

function PaperIllustration() {
  return <div className="landing-illustration" aria-label="Illustration of a mathematics paper with method and accuracy marks">
    <div className="illustration-orbit-line" aria-hidden="true" />
    <div className="landing-paper-back" aria-hidden="true" />
    <div className="landing-paper">
      <div className="landing-paper-masthead"><span>METHODMARK</span><span>01 / PRACTICE</span></div>
      <div className="landing-paper-title"><span>SECONDARY MATHEMATICS</span><h2>A little working.<br />A lot of understanding.</h2></div>
      <div className="landing-paper-meta"><span>Quadratic equations</span><span>3 marks</span></div>
      <p className="landing-paper-question"><b>1.</b> Solve x<sup>2</sup> &minus; 5x + 6 = 0.<br /><span>Show your working clearly.</span></p>
      <div className="landing-working" aria-hidden="true"><p>x<sup>2</sup> &minus; 2x &minus; 3x + 6 = 0 <Check size={20} /></p><p>(x &minus; 2)(x &minus; 3) = 0 <Check size={20} /></p><p className="landing-answer">x = 2 &nbsp;or&nbsp; x = 3 <Check size={20} /></p></div>
      <div className="landing-paper-bottom"><span>Every step counts.</span><span>1</span></div>
    </div>
    <div className="landing-mark-note"><span className="landing-note-icon"><ShieldCheck size={21} /></span><div><strong>The method matters.</strong><p>Method <b>2/2</b><span />Accuracy <b>1/1</b></p></div></div>
    <span className="landing-illustration-caption">A closer look at thoughtful practice</span>
  </div>;
}

export function LandingPage() {
  return <div className="public-site landing-page">
    <a className="public-skip" href="#main-content">Skip to content</a>
    <header className="public-header public-container"><Brand /><nav aria-label="Main navigation"><a className="public-nav-link" href="#how-it-works">How it works</a><a className="public-nav-link" href="#questions">FAQs</a><a className="public-login" href="/?view=login">Log in</a><a className="public-button small" href="/?view=signup">Get started<ArrowUpRight size={15} /></a></nav></header>
    <main id="main-content" className="landing-main">
      <section className="landing-hero public-container">
        <div className="landing-hero-copy"><p className="public-eyebrow"><span />MADE FOR MATHEMATICS TUTORS</p><h1>Less marking.<br />More <em>teaching.</em></h1><p className="landing-intro">From the first question to the final method mark.<br className="landing-desktop-break" /> A considered way to create meaningful practice,<br className="landing-desktop-break" /> clearer feedback, and your next lightbulb moment.</p><div className="landing-hero-actions"><a className="public-button" href="/?view=signup">Create your tutor account<ArrowRight size={17} /></a><a className="public-text-link" href="#how-it-works">Take a closer look<ArrowDown size={16} /></a></div><p className="landing-reassurance"><ShieldCheck size={15} />Your expertise. Always at the heart of it.</p></div>
        <PaperIllustration />
      </section>
      <div className="landing-principles public-container"><span>THOUGHTFUL BY DESIGN</span><p><BookOpen size={17} />Secondary mathematics</p><p><Check size={17} />Method marks matter</p><p><Link2 size={17} />No student accounts</p></div>
      <section id="how-it-works" className="landing-workflow public-container"><div className="landing-section-heading"><p className="public-eyebrow">A LITTLE LESS ADMIN</p><h2>From practice to progress.<br /><em>With you in control.</em></h2><p>One considered flow, built around the way you teach.</p></div><div className="landing-steps">{steps.map(({ number, icon: Icon, title, text }) => <article key={number}><div className="landing-step-top"><span>{number}</span><Icon size={22} strokeWidth={1.4} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section className="landing-belief"><div className="public-container landing-belief-inner"><div><p className="public-eyebrow">BEYOND THE FINAL ANSWER</p><h2>See the thinking.<br /><em>Support the learner.</em></h2></div><div><p>A correct method deserves recognition, even when the final answer misses the mark. MethodMark puts the working, the rubric and your judgement together.</p><div className="landing-belief-rule"><ShieldCheck size={21} /><span>AI can assist. Only you approve.</span></div><small>AI marking and progress analytics are being developed with tutor review at their core.</small></div></div></section>
      <section id="questions" className="landing-faq public-container"><div><p className="public-eyebrow">A FEW THINGS TO KNOW</p><h2>Good questions.<br /><em>Clear answers.</em></h2></div><div className="landing-faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
      <section className="landing-final public-container"><span className="public-eyebrow">MAKE ROOM FOR THE MOMENTS THAT MATTER</span><h2>Your next great lesson<br />starts with <em>a little space.</em></h2><a className="public-button" href="/?view=signup">Get started with MethodMark<ArrowRight size={17} /></a><p>Already have an account? <a href="/?view=login">Log in</a></p></section>
    </main>
    <footer className="public-footer public-container"><Brand /><span>Made for the way you teach.</span><small>&copy; {new Date().getFullYear()} MethodMark</small></footer>
  </div>;
}
