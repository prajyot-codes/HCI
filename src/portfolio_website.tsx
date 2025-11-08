import { useState, useEffect, useRef, FormEvent, ReactNode } from 'react';
import { Menu, X, Github, Linkedin, Mail, ExternalLink, ChevronDown } from 'lucide-react';
import * as THREE from 'three';

/* ===========================
   Tiny scroll-reveal helper
   =========================== */
function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        obs.unobserve(entry.target); // reveal once
      }
    }, options ?? { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);

  return { ref, inView };
}

const Reveal: React.FC<{ children: ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const { ref, inView } = useInView({ threshold: 0.15 });
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${className} will-change-transform will-change-opacity transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {children}
    </div>
  );
};

/* ===========================
   Three.js Hero Background
   =========================== */

// GLSL for a smooth gradient + subtle animated noise shimmer
const gradientFrag = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;

float hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5,183.3)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise(in vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 nUV = uv * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;

  float g = smoothstep(0.0, 1.0, uv.y);
  vec3 base = mix(uBottomColor, uTopColor, g);

  float n  = noise(nUV * 1.5 + uTime * 0.02);
  float n2 = noise(nUV * 3.0 + vec2(10.0, -5.0) + uTime * 0.03);
  float n3 = noise(nUV * 6.0 - vec2(4.0, 8.0) + uTime * 0.04);

  float nebula = (n * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.12;
  vec3 col = base + vec3(nebula, nebula * 0.8, nebula * 1.1);

  vec2 d = uv - 0.5;
  float vign = smoothstep(0.9, 0.2, length(d));
  col *= mix(0.85, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
`;

const gradientVert = `
precision mediump float;
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

const ThreeScene: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Scenes & cameras
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 14);

    // Fullscreen gradient (shader)
    const bgUniforms = {
      uResolution: { value: new THREE.Vector2(mount.clientWidth, mount.clientHeight) },
      uTime: { value: 0 },
      uTopColor: { value: new THREE.Color('#0b1020') },
      uBottomColor: { value: new THREE.Color('#091a1a') },
    };

    const bgMat = new THREE.ShaderMaterial({
      vertexShader: gradientVert,
      fragmentShader: gradientFrag,
      uniforms: bgUniforms as unknown as Record<string, THREE.IUniform>,
      depthWrite: false,
      depthTest: false,
    });

    const bgGeo = new THREE.PlaneGeometry(2, 2);
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    bgScene.add(bgMesh);

    // Starfield
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const radius = 40 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i3 + 2] = radius * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      color: 0xb7f5ff,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Floating spheres
    type Vel = { x: number; y: number; z: number };
    type SphereWithVel = THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> & {
      userData: { velocity: Vel };
    };

    const spheres: SphereWithVel[] = [];
    for (let i = 0; i < 12; i++) {
      const geometry = new THREE.SphereGeometry(Math.random() * 0.45 + 0.25, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: Math.random() > 0.5 ? 0x00ffd1 : 0x6ae3ff,
        emissive: Math.random() > 0.5 ? 0x007a66 : 0x005f77,
        shininess: 90,
        transparent: true,
        opacity: 0.9,
      });
      const s = new THREE.Mesh(geometry, material) as SphereWithVel;
      s.position.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 16
      );
      s.userData = {
        velocity: {
          x: (Math.random() - 0.5) * 0.015,
          y: (Math.random() - 0.5) * 0.015,
          z: (Math.random() - 0.5) * 0.015,
        },
      };
      spheres.push(s);
      scene.add(s);
    }

    // Mist points
    const mistGeo = new THREE.BufferGeometry();
    const mistCount = 900;
    const mist = new Float32Array(mistCount * 3);
    for (let i = 0; i < mistCount * 3; i += 3) {
      mist[i + 0] = (Math.random() - 0.5) * 30;
      mist[i + 1] = (Math.random() - 0.5) * 18;
      mist[i + 2] = (Math.random() - 0.5) * 24;
    }
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mist, 3));
    const mistMat = new THREE.PointsMaterial({
      size: 0.04,
      color: 0x7fffd4,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    });
    const mistPoints = new THREE.Points(mistGeo, mistMat);
    scene.add(mistPoints);

    // Lights
    const key = new THREE.PointLight(0xaaf0ff, 1.6, 120);
    key.position.set(12, 10, 10);
    scene.add(key);

    const rim = new THREE.PointLight(0x6fffe0, 1.2, 120);
    rim.position.set(-10, -8, -6);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(0x223344, 0.6));

    // Parallax with mouse
    const mouse = new THREE.Vector2();
    let parallaxX = 0;
    let parallaxY = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width - 0.5;
      mouse.y = (e.clientY - rect.top) / rect.height - 0.5;
    };
    mount.addEventListener('pointermove', onPointerMove);

    // Animate
    let t = 0;
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.016;

      // uniforms
      (bgUniforms.uTime as THREE.IUniform).value = t;
      (bgUniforms.uResolution as THREE.IUniform).value.set(mount.clientWidth, mount.clientHeight);

      // star/mist drift
      stars.rotation.y += 0.0005;
      mistPoints.rotation.y += 0.0007;

      // spheres float
      for (const s of spheres) {
        s.position.x += s.userData.velocity.x;
        s.position.y += s.userData.velocity.y;
        s.position.z += s.userData.velocity.z;

        if (Math.abs(s.position.x) > 10) s.userData.velocity.x *= -1;
        if (Math.abs(s.position.y) > 8) s.userData.velocity.y *= -1;
        if (Math.abs(s.position.z) > 10) s.userData.velocity.z *= -1;

        s.rotation.x += 0.008;
        s.rotation.y += 0.009;
      }

      // parallax camera
      parallaxX += (mouse.x * 0.8 - parallaxX) * 0.03;
      parallaxY += (mouse.y * 0.6 - parallaxY) * 0.03;
      camera.position.x = parallaxX;
      camera.position.y = -parallaxY;
      camera.lookAt(0, 0, 0);

      renderer.autoClear = true;
      renderer.clear();
      renderer.render(bgScene, bgCam);
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      (bgUniforms.uResolution as THREE.IUniform).value.set(w, h);
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      mount.removeEventListener('pointermove', onPointerMove);

      stars.geometry.dispose();
      (stars.material as THREE.PointsMaterial).dispose();
      mistGeo.dispose();
      mistMat.dispose();
      for (const s of spheres) {
        s.geometry.dispose();
        s.material.dispose();
      }
      bgGeo.dispose();
      bgMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
};

/* ===========================
   Project Card & Skill Badge
   =========================== */

interface ProjectCardProps {
  title: string;
  category: string;
  description: string;
  tools: string;
  link?: string;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ title, category, description, tools, link }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-gray-700 transition-all duration-300 transform hover:-translate-y-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xl font-bold text-gray-200">{title}</h3>
        {link && (
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink
              className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${
                isHovered ? 'translate-x-1 -translate-y-1' : ''
              }`}
            />
          </a>
        )}
      </div>
      <p className="text-gray-500 text-sm font-medium mb-3">{category}</p>
      <p className="text-gray-400 text-sm mb-4 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-2">
        {tools.split(',').map((tool, i) => (
          <span key={i} className="px-3 py-1 bg-gray-800 text-gray-400 text-xs rounded-full border border-gray-700">
            {tool.trim()}
          </span>
        ))}
      </div>
    </div>
  );
};

const SkillBadge: React.FC<{ skill: string }> = ({ skill }) => (
  <div className="px-4 py-2 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 text-gray-300 text-sm">
    {skill}
  </div>
);

/* ===========================
   Main Portfolio
   =========================== */

type SectionId = 'home' | 'about' | 'projects' | 'skills' | 'contact';
type FormStatus = {
  type: 'loading' | 'success' | 'error' | '';
  message: string;
};

const Portfolio: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [formStatus, setFormStatus] = useState<FormStatus>({ type: '', message: '' });
  const [scrolled, setScrolled] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // EmailJS (your values)
  const EMAILJS_SERVICE_ID = 'service_fm39n3j';
  const EMAILJS_TEMPLATE_ID = 'template_g0etjl5';
  const EMAILJS_PUBLIC_KEY = 'R12Vjv3kiTBcTb34E';

  // Navbar scroll + active section
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);

      (['home', 'about', 'projects', 'skills', 'contact'] as const).forEach((section) => {
        const el = document.getElementById(section);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 150 && rect.bottom >= 150) setActiveSection(section);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormStatus({ type: 'loading', message: 'Sending...' });

    try {
      const emailjs = (window as {
        emailjs?: {
          sendForm: (
            serviceId: string,
            templateId: string,
            form: HTMLFormElement,
            publicKey: string
          ) => Promise<{ status: number }>;
        };
      }).emailjs;

      if (!emailjs) throw new Error('EmailJS is not loaded. Add the EmailJS script or install @emailjs/browser.');

      if (formRef.current) {
        await emailjs.sendForm(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          formRef.current,
          EMAILJS_PUBLIC_KEY
        );
        formRef.current.reset();
      }

      setFormStatus({ type: 'success', message: "Message sent successfully! I'll get back to you soon." });
      setTimeout(() => setFormStatus({ type: '', message: '' }), 5000);
    } catch (error) {
      console.error('EmailJS Error:', error);
      setFormStatus({
        type: 'error',
        message: 'Failed to send message. Please try again or email me directly at narwareprajyot25@gmail.com',
      });
      setTimeout(() => setFormStatus({ type: '', message: '' }), 5000);
    }
  };

  const scrollToSection = (sectionId: SectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const offsetTop = el.offsetTop - 80;
    window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    setActiveSection(sectionId);
    setIsMenuOpen(false);
  };

  const projects = [
    {
      title: 'Real Estate Management System',
      category: 'Full-Stack Web Development',
      description:
        'Designed and developed a full-featured property management platform where owners can list properties, tenants can request contracts, and both parties can manage bills and maintenance requests seamlessly.',
      tools: 'Node.js, Express.js, React, PostgreSQL, Cloudinary, REST APIs',
      link: '',
    },
    {
      title: 'Distributed Learning Management System (LMS)',
      category: 'Web Development / Cloud Architecture',
      description:
        'Built a distributed LMS supporting real-time online classes, screen sharing, attendance tracking, and automatic lecture recording with 100ms and LiveKit integration.',
      tools: 'MERN Stack, 100ms SDK, LiveKit API, WebRTC, Socket.io, AWS',
      link: '',
    },
    {
      title: 'Arduino-based Smart Waste Segregator',
      category: 'IoT & Web Integration',
      description:
        'Created a waste segregation system using UV and metal sensors with a reward-based web application. Users receive unique codes linked to their profiles to update points upon waste disposal.',
      tools: 'Arduino, C++, Node.js, Express, REST API, Cloudinary',
      link: '',
    },
    {
      title: 'Business Website for Exporting Startup',
      category: 'Web Design & Development',
      description:
        "Designed and developed a responsive business website for a client's export startup, featuring a modern layout, product showcase, and inquiry form to enhance their online presence.",
      tools: 'React.js, Tailwind CSS, Figma, JavaScript, Responsive UI Design',
      link: '',
    },
  ];

  const skills = {
    research: ['Requirement Analysis', 'System Design Planning', 'Usability Evaluation'],
    design: ['Figma', 'Canva', 'Lucidchart'],
    development: [
      'C++',
      'Python',
      'JavaScript',
      'Node.js',
      'Express.js',
      'React.js',
      'PostgreSQL',
      'MongoDB',
      'HTML/CSS',
    ],
    hci: ['Design Thinking', 'Rapid Prototyping', 'Iterative Testing', 'User Feedback Integration'],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled ? 'bg-gray-950/95 backdrop-blur-md shadow-lg' : 'bg-gray-950/80 backdrop-blur-sm'
        } border-b border-gray-800`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => scrollToSection('home')}
              className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-200 to-gray-400 bg-clip-text text-transparent hover:from-gray-100 hover:to-gray-300 transition-all"
            >
              Prajyot Narware
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {(['home', 'about', 'projects', 'skills', 'contact'] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => scrollToSection(section)}
                  className={`px-4 py-2 rounded-lg capitalize text-sm font-medium transition-all duration-300 ${
                    activeSection === section
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  {section}
                </button>
              ))}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div
          className={`md:hidden transition-all duration-300 ease-in-out overflow-hidden ${
            isMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-4 pt-2 pb-4 space-y-1 bg-gray-900/95 backdrop-blur-md border-t border-gray-800">
            {(['home', 'about', 'projects', 'skills', 'contact'] as const).map((section) => (
              <button
                key={section}
                onClick={() => scrollToSection(section)}
                className={`block w-full text-left px-4 py-3 rounded-lg capitalize text-sm font-medium transition-all ${
                  activeSection === section
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {section}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="min-h-screen flex items-center justify-center relative overflow-hidden pt-16">
        <div className="absolute inset-0 z-0">
          <ThreeScene />
        </div>

        <div className="relative z-10 text-center px-6 max-w-4xl">
          <Reveal>
            <h2 className="text-6xl md:text-8xl font-bold mb-6">
              <span className="bg-gradient-to-r from-gray-100 via-gray-300 to-gray-100 bg-clip-text text-transparent">
                PRAJYOT NARWARE
              </span>
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <h3 className="text-3xl md:text-5xl font-bold mb-6 text-gray-400">
  <span className="block">I am a passionate</span>
  <span className="text-gray-500">
    {/* Typed.js will type inside this span */}
    <span id="element" className="inline-block min-w-[12ch]"></span>
  </span>
</h3>
          </Reveal>

          <Reveal delay={140}>
            <p className="text-xl text-gray-400 mb-8 leading-relaxed">
              Building scalable and real-time applications that combine creativity with performance
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="flex gap-4 justify-center">
              <a
                href="https://github.com/prajyot-codes"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-900 rounded-full hover:bg-gray-700 transition-colors"
              >
                <Github className="w-6 h-6" />
              </a>
              <a
                href="https://www.linkedin.com/in/prajyot-narware-51a13b277/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-900 rounded-full hover:bg-gray-700 transition-colors"
              >
                <Linkedin className="w-6 h-6" />
              </a>
              <a
                href="mailto:narwareprajyot25@gmail.com"
                className="p-3 bg-gray-900 rounded-full hover:bg-gray-700 transition-colors"
              >
                <Mail className="w-6 h-6" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={260}>
            <button onClick={() => scrollToSection('about')} className="mt-12 animate-bounce">
              <ChevronDown className="w-8 h-8 text-gray-500" />
            </button>
          </Reveal>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="max-w-4xl w-full">
          <Reveal>
            <h2 className="text-4xl font-bold mb-8 text-center text-gray-200">About Me</h2>
          </Reveal>

          <Reveal delay={80}>
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-800">
              <p className="text-lg text-gray-400 leading-relaxed mb-6">
                I'm a passionate full-stack web developer and cloud enthusiast with a strong foundation in C++, Python, and database systems. I enjoy building scalable and real-time applications that combine creativity with performance.
              </p>
              <p className="text-lg text-gray-400 leading-relaxed mb-6">
                Currently, I'm exploring cloud engineering and distributed systems to expand my technical expertise.
              </p>
              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <Reveal><div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                  <h3 className="text-xl font-semibold mb-3 text-gray-300">Education</h3>
                  <p className="text-gray-400">B.Tech in Computer Science and Engineering</p>
                  <p className="text-gray-500 text-sm">2023–2027 (Ongoing)</p>
                </div></Reveal>
                <Reveal delay={80}><div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                  <h3 className="text-xl font-semibold mb-3 text-gray-300">Achievements</h3>
                  <ul className="text-gray-400 text-sm space-y-1">
                    <li>• Hacktoberfest Contributor 2024</li>
                    <li>• Smart India Hackathon Finalist</li>
                    <li>• Google Cloud Skill Boost (In Progress)</li>
                  </ul>
                </div></Reveal>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="min-h-screen px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <Reveal><h2 className="text-4xl font-bold mb-12 text-center text-gray-200">Featured Projects</h2></Reveal>
          <div className="grid md:grid-cols-2 gap-8">
            {projects.map((project, index) => (
              <Reveal key={index} delay={index * 120}>
                <ProjectCard {...project} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section id="skills" className="min-h-screen px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <Reveal><h2 className="text-4xl font-bold mb-12 text-center text-gray-200">Skills & Expertise</h2></Reveal>
          <div className="space-y-8">
            <Reveal>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-300">Research</h3>
                <div className="flex flex-wrap gap-3">
                  {skills.research.map((skill, i) => (
                    <Reveal key={skill} delay={i * 80}>
                      <SkillBadge skill={skill} />
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-300">Design Tools</h3>
                <div className="flex flex-wrap gap-3">
                  {skills.design.map((skill, i) => (
                    <Reveal key={skill} delay={i * 80}>
                      <SkillBadge skill={skill} />
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-300">Development</h3>
                <div className="flex flex-wrap gap-3">
                  {skills.development.map((skill, i) => (
                    <Reveal key={skill} delay={i * 60}>
                      <SkillBadge skill={skill} />
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-300">HCI Methods</h3>
                <div className="flex flex-wrap gap-3">
                  {skills.hci.map((skill, i) => (
                    <Reveal key={skill} delay={i * 80}>
                      <SkillBadge skill={skill} />
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="max-w-2xl w-full">
          <Reveal><h2 className="text-4xl font-bold mb-8 text-center text-gray-200">Get In Touch</h2></Reveal>
          <Reveal delay={80}>
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-800">
              <p className="text-center text-gray-400 mb-8 text-lg">
                I'm always open to discussing new projects, creative ideas, or opportunities to be part of your visions.
              </p>

              {/* Contact Form */}
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-gray-300 mb-2 text-sm font-medium">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="user_name"
                    required
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-gray-300 mb-2 text-sm font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="user_email"
                    required
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-gray-300 mb-2 text-sm font-medium">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="user_phone"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-gray-300 mb-2 text-sm font-medium">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors resize-none"
                    placeholder="Tell me about your project..."
                  ></textarea>
                </div>

                {formStatus.message && (
                  <div
                    className={`p-4 rounded-lg ${
                      formStatus.type === 'success'
                        ? 'bg-green-900/30 border border-green-700 text-green-400'
                        : formStatus.type === 'error'
                        ? 'bg-red-900/30 border border-red-700 text-red-400'
                        : 'bg-gray-800/50 border border-gray-700 text-gray-400'
                    }`}
                  >
                    {formStatus.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={formStatus.type === 'loading'}
                  className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg transition-all transform hover:scale-105 font-medium"
                >
                  {formStatus.type === 'loading' ? 'Sending...' : 'Send Message'}
                </button>
              </form>

              <div className="flex gap-4 justify-center mt-8 pt-8 border-t border-gray-800">
                <a
                  href="https://github.com/prajyot-codes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <Github className="w-5 h-5" />
                  GitHub
                </a>
                <a
                  href="https://www.linkedin.com/in/prajyot-narware-51a13b277/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <Linkedin className="w-5 h-5" />
                  LinkedIn
                </a>
                <a href="mailto:narwareprajyot25@gmail.com" className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors">
                  <Mail className="w-5 h-5" />
                  Email
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950/90 backdrop-blur-md border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500">
          <p>© 2025 Prajyot Narware. Built with React & Three.js</p>
        </div>
      </footer>
    </div>
  );
};

export default Portfolio;
