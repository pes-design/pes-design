(() => {
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta) {
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover');
  }
  ['gesturestart','gesturechange','gestureend'].forEach(type => {
    document.addEventListener(type, event => event.preventDefault(), {passive:false});
  });
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, {passive:false});

  /**
   * WebGL screen distortion adapted from Eric Leong's fisheye.js.
   * https://github.com/ericleong/fisheye.js — MIT License, copyright Eric Leong.
   */
  class CRTScreenRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const options = {alpha:true,depth:false,antialias:true,preserveDrawingBuffer:false};
      this.gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
      if (!this.gl) return;
      const gl = this.gl;
      const vertex = 'attribute vec2 p;attribute vec2 t;varying highp vec2 v;void main(){gl_Position=vec4(p,0.,1.);v=t;}';
      const fragment = `precision mediump float;varying highp vec2 v;uniform sampler2D image;uniform vec3 distortion;uniform float ratio;
        float scaleFor(float d,float limit){return d>=0.0?1.0+d*limit:1.0/(1.0-d*limit);}
        void main(){float rsq;float limit;if(ratio<1.0){rsq=pow((v.x-.5)*ratio,2.0)+pow(v.y-.5,2.0);limit=(pow(.5*ratio,2.0)+pow(.5,2.0))/(2.0/ratio);}else{rsq=pow(v.x-.5,2.0)+pow((v.y-.5)/ratio,2.0);limit=(pow(.5,2.0)+pow(.5/ratio,2.0))/(2.0*ratio);}vec3 s=vec3(scaleFor(distortion.r,limit),scaleFor(distortion.g,limit),scaleFor(distortion.b,limit));vec2 r=vec2(.5+(v.x-.5)*(1.0+distortion.r*rsq)/s.r,.5+(v.y-.5)*(1.0+distortion.r*rsq)/s.r);vec2 g=vec2(.5+(v.x-.5)*(1.0+distortion.g*rsq)/s.g,.5+(v.y-.5)*(1.0+distortion.g*rsq)/s.g);vec2 b=vec2(.5+(v.x-.5)*(1.0+distortion.b*rsq)/s.b,.5+(v.y-.5)*(1.0+distortion.b*rsq)/s.b);vec4 c=vec4(0.,0.,0.,1.);if(r.x>=0.&&r.x<=1.&&r.y>=0.&&r.y<=1.)c.r=texture2D(image,r).r;if(g.x>=0.&&g.x<=1.&&g.y>=0.&&g.y<=1.)c.g=texture2D(image,g).g;if(b.x>=0.&&b.x<=1.&&b.y>=0.&&b.y<=1.)c.b=texture2D(image,b).b;gl_FragColor=c;}`;
      const shader = (type, source) => {
        const item = gl.createShader(type);
        gl.shaderSource(item, source);
        gl.compileShader(item);
        if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
        return item;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      this.p = gl.getAttribLocation(this.program, 'p');
      this.t = gl.getAttribLocation(this.program, 't');
      this.uDistortion = gl.getUniformLocation(this.program, 'distortion');
      this.uRatio = gl.getUniformLocation(this.program, 'ratio');
      this.uImage = gl.getUniformLocation(this.program, 'image');
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      this.textureBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1,1,1,0,0,1,0]), gl.STATIC_DRAW);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.values = [-.42,-.36,-.3];
    }
    setDistortion(red, green, blue) { this.values = [red,green,blue]; }
    draw(source) {
      const gl = this.gl;
      if (!gl) {
        const context = this.canvas.getContext('2d');
        context?.drawImage(source,0,0,this.canvas.width,this.canvas.height);
        return;
      }
      const density = Math.min(2,window.devicePixelRatio||1);
      this.canvas.width = Math.max(1,Math.round(this.canvas.clientWidth*density));
      this.canvas.height = Math.max(1,Math.round(this.canvas.clientHeight*density));
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.enableVertexAttribArray(this.p);gl.vertexAttribPointer(this.p,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.textureBuffer);gl.enableVertexAttribArray(this.t);gl.vertexAttribPointer(this.t,2,gl.FLOAT,false,0,0);
      gl.uniform3fv(this.uDistortion,this.values);gl.uniform1f(this.uRatio,source.width/source.height);gl.uniform1i(this.uImage,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('#hero');
  const introGrid = hero?.querySelector('.hero-intro-grid');
  const about = hero?.querySelector('.hero-about');
  const logoWrap = introGrid?.querySelector('.hero-logo-wrap');
  const photoCard = introGrid?.querySelector('.hero-photo-card');
  const aboutText = about?.querySelector('.hero-about-text');

  if (hero && introGrid && about && logoWrap && photoCard && aboutText) {
    logoWrap.classList.add('hero-centered-logo');
    aboutText.classList.add('hero-profile-copy');

    const ruBio = [...aboutText.querySelectorAll(':scope > p[data-ru]')];
    const enBio = [...aboutText.querySelectorAll(':scope > p[data-en]')];
    if (ruBio[0]) ruBio[0].textContent = 'Я — графический дизайнер и 3D-художник, который превращает идеи в цельные визуальные системы. Разрабатываю айдентику, упаковку, иллюстрации, плакаты и объекты — от исследования и концепции до готовых макетов и производства.';
    if (ruBio[1]) ruBio[1].textContent = 'Соединяю точную работу с формой, типографикой и материалом с экспериментальным подходом. Сотрудничаю с брендами, агентствами и независимыми командами; открыт к коммерческим проектам и коллаборациям.';
    if (enBio[0]) enBio[0].textContent = 'I am a graphic designer and 3D artist who turns ideas into cohesive visual systems. I develop identities, packaging, illustrations, posters, and objects — from research and concept through production-ready artwork and fabrication.';
    if (enBio[1]) enBio[1].textContent = 'I combine precise work with form, typography, and materials with an experimental approach. I collaborate with brands, agencies, and independent teams, and I am open to commissions and creative collaborations.';

    const disciplines = document.createElement('p');
    disciplines.className = 'hero-disciplines-inline';
    disciplines.innerHTML = '<span data-ru>Работаю с айдентикой, инфографикой, 3D-моделированием, полиграфией, иллюстрацией, плакатами и визуальными экспериментами.</span><span data-en>I work across identity, infographics, 3D modelling, print, illustration, posters, and visual experimentation.</span>';
    aboutText.append(disciplines);

    const profile = document.createElement('div');
    profile.className = 'hero-profile-grid';
    profile.id = 'about';
    profile.append(photoCard, aboutText);

    hero.insertBefore(logoWrap, introGrid);
    hero.insertBefore(profile, introGrid);
    introGrid.remove();
    about.remove();
  }

  const profileGrid = document.querySelector('.hero-profile-grid');
  const gritSection = document.querySelector('#ch6');
  if (profileGrid && gritSection) {
    hero?.classList.add('hero-logo-only');
    profileGrid.removeAttribute('id');
    const aboutSection = document.createElement('section');
    aboutSection.className = 'about-section';
    aboutSection.id = 'about';
    const aboutLabel = document.createElement('div');
    aboutLabel.className = 'about-section-label caps';
    aboutLabel.innerHTML = '<span data-ru>Обо мне</span><span data-en>About</span>';
    aboutSection.append(aboutLabel, profileGrid);
    gritSection.after(aboutSection);
  }

  const projectIds = ['ch5','ch1','ch2','ch3','ch4','ch6'];
  const projectSections = projectIds.map(id => document.getElementById(id)).filter(Boolean);
  if (projectSections.length) {
    const projectsGate = document.createElement('section');
    projectsGate.className = 'projects-gate';
    projectsGate.id = 'projects';

    const projectsHint = document.createElement('div');
    projectsHint.className = 'projects-gate-hint mono';
    projectsHint.innerHTML = '<span data-ru>НАЖМИ МЕНЯ</span><span data-en>CLICK ME</span>';

    const projectsToggle = document.createElement('button');
    projectsToggle.className = 'projects-toggle';
    projectsToggle.type = 'button';
    projectsToggle.setAttribute('aria-expanded', 'false');
    projectsToggle.setAttribute('aria-controls', 'projects-shell');
    projectsToggle.innerHTML = '<span data-ru>ПРОЕКТЫ</span><span data-en>PROJECTS</span>';

    const projectsArrow = document.createElement('span');
    projectsArrow.className = 'projects-arrow';
    projectsArrow.setAttribute('aria-hidden', 'true');

    const projectsShell = document.createElement('div');
    projectsShell.className = 'projects-shell';
    projectsShell.id = 'projects-shell';
    projectsShell.hidden = true;

    projectsGate.append(projectsHint, projectsToggle, projectsArrow);
    projectSections[0].before(projectsGate);
    projectsGate.after(projectsShell);
    projectSections.forEach(section => projectsShell.append(section));

    projectsToggle.addEventListener('click', () => {
      const open = projectsToggle.getAttribute('aria-expanded') !== 'true';
      projectsToggle.setAttribute('aria-expanded', String(open));
      projectsShell.hidden = !open;
      document.body.classList.toggle('projects-open', open);
      if (open) requestAnimationFrame(() => projectSections[0].scrollIntoView({behavior:'smooth', block:'start'}));
    });

    document.querySelectorAll('.site-nav a[href="#ch5"]').forEach(link => link.setAttribute('href', '#projects'));
  }

  const contact = document.querySelector('footer.contact');
  if (contact) {
    contact.id = 'contact-panel';
    contact.setAttribute('aria-label', 'Контакты');
    const contactArt = document.createElement('img');
    contactArt.className = 'contact-organic-art';
    contactArt.src = 'contact-organic-cutout.png';
    contactArt.alt = '';
    contactArt.draggable = false;
    contactArt.setAttribute('aria-hidden', 'true');
    contact.append(contactArt);
    const spacer = document.createElement('div');
    spacer.className = 'contact-reveal-spacer';
    spacer.id = 'contact';
    spacer.setAttribute('aria-hidden', 'true');
    contact.before(spacer);
    if ('IntersectionObserver' in window) {
      const contactObserver = new IntersectionObserver(entries => {
        document.body.classList.toggle('contact-revealed', entries.some(entry => entry.isIntersecting));
      }, {threshold:.04});
      contactObserver.observe(spacer);
    } else {
      document.body.classList.add('contact-revealed');
    }
  }

  const sourceLogo = document.querySelector('.hero-centered-logo .hero-logo');
  const firstHeader = document.querySelector('header.top');
  let introShell = null;

  if (firstHeader) {
    firstHeader.querySelector('.logo-img')?.remove();

    const headerTrigger = document.createElement('div');
    headerTrigger.className = 'header-trigger';
    headerTrigger.setAttribute('aria-hidden', 'true');
    document.body.append(headerTrigger);

    let headerHideTimer = 0;
    let headerVisibleUntil = 0;
    let pointerInHeader = false;

    const hideHeaderWhenReady = () => {
      window.clearTimeout(headerHideTimer);
      if (pointerInHeader) return;
      const delay = Math.max(0, headerVisibleUntil - Date.now());
      headerHideTimer = window.setTimeout(() => {
        if (!pointerInHeader) document.body.classList.remove('header-visible');
      }, delay);
    };
    const showHeader = () => {
      document.body.classList.add('header-visible');
      headerVisibleUntil = Date.now() + 5000;
      hideHeaderWhenReady();
    };

    headerTrigger.addEventListener('pointerenter', showHeader);
    firstHeader.addEventListener('pointerenter', () => {
      pointerInHeader = true;
      window.clearTimeout(headerHideTimer);
    });
    firstHeader.addEventListener('pointerleave', () => {
      pointerInHeader = false;
      hideHeaderWhenReady();
    });

    if (window.matchMedia('(pointer:coarse)').matches) {
      document.body.classList.add('header-visible');
    }
  }

  if (!reduceMotion && sourceLogo && firstHeader) {
    introShell = document.createElement('section');
    introShell.className = 'crt-intro-shell';
    introShell.setAttribute('aria-label', 'Вступительная анимация');

    const stage = document.createElement('div');
    stage.className = 'crt-intro-stage';
    const scene = document.createElement('div');
    scene.className = 'crt-monitor-scene';

    const monitor = document.createElement('img');
    monitor.className = 'crt-monitor-image';
    monitor.src = 'crt-monitor-screen-transparent-4k.png';
    monitor.alt = '';
    monitor.setAttribute('aria-hidden', 'true');

    const screen = document.createElement('div');
    screen.className = 'crt-screen';
    const fisheyeCanvas = document.createElement('canvas');
    fisheyeCanvas.className = 'crt-fisheye-canvas';
    fisheyeCanvas.setAttribute('aria-label', 'Миниатюрный вид сайта внутри экрана');

    const noise = document.createElement('div');
    noise.className = 'crt-noise';
    const scanlines = document.createElement('div');
    scanlines.className = 'crt-scanlines';
    const vignette = document.createElement('div');
    vignette.className = 'crt-vignette';
    const flash = document.createElement('div');
    flash.className = 'crt-flash';

    const progress = document.createElement('div');
    progress.className = 'crt-progress';
    progress.innerHTML = '<span data-ru>Прокрутите или нажмите на экран</span><span data-en>Scroll or click the screen</span>';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'crt-skip';
    skip.setAttribute('aria-label', 'Пропустить вступление');

    screen.append(fisheyeCanvas, noise, scanlines, vignette);
    scene.append(screen, monitor, skip);
    stage.append(scene, flash, progress);
    introShell.append(stage);
    document.body.insertBefore(introShell, firstHeader);
    document.body.classList.add('has-crt-intro', 'intro-active');

    const miniSite = document.createElement('canvas');
    miniSite.width = 1100;
    miniSite.height = 860;
    const miniContext = miniSite.getContext('2d');
    const portraitSource = document.querySelector('.hero-profile-grid .hero-photo');
    let screenRenderer = null;
    try { screenRenderer = new CRTScreenRenderer(fisheyeCanvas); } catch (error) { console.warn('CRT screen fallback', error); }

    const drawContained = (context, image, x, y, width, height) => {
      if (!image?.naturalWidth || !image?.naturalHeight) return;
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    };

    const drawCover = (context, image, x, y, width, height) => {
      if (!image?.naturalWidth || !image?.naturalHeight) return;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      const sourceX = (image.naturalWidth - sourceWidth) / 2;
      const sourceY = (image.naturalHeight - sourceHeight) / 2;
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    };

    const drawMiniToScreen = () => {
      if (screenRenderer) {
        screenRenderer.draw(miniSite);
        return;
      }
      const density = Math.min(2, window.devicePixelRatio || 1);
      fisheyeCanvas.width = Math.max(1, Math.round(fisheyeCanvas.clientWidth * density));
      fisheyeCanvas.height = Math.max(1, Math.round(fisheyeCanvas.clientHeight * density));
      fisheyeCanvas.getContext('2d')?.drawImage(miniSite, 0, 0, fisheyeCanvas.width, fisheyeCanvas.height);
    };

    const paintMiniSite = () => {
      const context = miniContext;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, miniSite.width, miniSite.height);
      context.strokeStyle = 'rgba(17,17,16,.22)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, 70);
      context.lineTo(miniSite.width, 70);
      context.stroke();

      context.fillStyle = '#111110';
      context.font = '500 16px Arial, sans-serif';
      context.fillText('PES', 48, 44);
      context.font = '500 12px monospace';
      context.fillStyle = '#65655f';
      context.fillText('РАБОТЫ     ОБО МНЕ     КОНТАКТЫ', 688, 43);

      drawContained(context, sourceLogo, 138, 112, 824, 250);
      context.strokeStyle = 'rgba(17,17,16,.16)';
      context.beginPath();
      context.moveTo(54, 408);
      context.lineTo(1046, 408);
      context.stroke();

      drawCover(context, portraitSource, 54, 450, 318, 356);
      context.fillStyle = '#111110';
      context.font = '500 42px Arial, sans-serif';
      context.fillText('Павел, он же PЁS', 432, 512);
      context.fillStyle = '#666660';
      context.font = '400 19px Arial, sans-serif';
      const lines = [
        'Графический дизайнер и 3D-художник.',
        'Создаю айдентику, упаковку, иллюстрации',
        'и мерч — от концепции до готового объекта.',
        '',
        'Брендинг · инфографика · 3D · полиграфия',
        'иллюстрация · плакаты · эксперименты'
      ];
      lines.forEach((line, index) => context.fillText(line, 432, 564 + index * 35));
      drawMiniToScreen();
    };

    const imageReady = image => {
      if (!image || image.complete) return Promise.resolve();
      if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
      return new Promise(resolve => image.addEventListener('load', resolve, {once:true}));
    };
    Promise.all([imageReady(sourceLogo), imageReady(portraitSource), document.fonts?.ready || Promise.resolve()]).then(paintMiniSite);

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const smoothstep = (edge0, edge1, value) => {
      const x = clamp((value - edge0) / (edge1 - edge0));
      return x * x * (3 - 2 * x);
    };

    let ticking = false;
    let transitionCommitted = false;
    let introZoom = .82;
    let introZoomTarget = .82;

    const finishIntro = () => {
      stage.style.opacity = '0';
      introShell.style.display = 'none';
      document.body.classList.remove('intro-active', 'has-crt-intro', 'portal-committing');
      document.documentElement.style.setProperty('--portal-rgb', '0px');
      window.scrollTo(0, 0);
    };

    const commitTransition = (animated = true) => {
      if (transitionCommitted) return;
      transitionCommitted = true;
      document.body.classList.add('portal-committing');

      if (!animated || !stage.animate) {
        finishIntro();
        return;
      }

      const currentTransform = scene.style.transform || 'translate3d(0,0,0) scale(.82)';
      scene.animate([
        {filter:'brightness(1) contrast(1)',transform:currentTransform},
        {filter:'brightness(1.9) contrast(1.18)',transform:'translate3d(0,0,0) scale(2.35)',offset:.46},
        {filter:'brightness(3.2) contrast(.75) blur(2px)',transform:'translate3d(0,0,0) scale(3.12)'}
      ], {duration:560,easing:'cubic-bezier(.25,.7,.2,1)',fill:'forwards'});
      flash.animate([
        {opacity:0},
        {opacity:.96,offset:.48},
        {opacity:1,offset:.64},
        {opacity:1}
      ], {duration:560,easing:'ease-out',fill:'forwards'});
      window.setTimeout(finishIntro, 570);
    };

    const paintIntro = () => {
      if (transitionCommitted) {
        ticking = false;
        return;
      }
      introZoom += (introZoomTarget - introZoom) * .16;
      if (Math.abs(introZoomTarget - introZoom) < .0005) introZoom = introZoomTarget;
      const p = clamp((introZoom - .82) / 2.08);

      scene.style.transform = `translate3d(0,0,0) scale(${introZoom})`;
      scene.style.filter = 'none';
      screen.style.transform = 'none';
      screenRenderer?.setDistortion(.56 + p * .3, .49 + p * .25, .42 + p * .2);
      drawMiniToScreen();
      noise.style.opacity = String(.13 + p * .2);
      scanlines.style.opacity = String(.22 + p * .18);
      flash.style.opacity = '0';
      progress.style.opacity = String(1 - smoothstep(.12, .38, p));
      stage.style.opacity = '1';
      if (introZoom >= 2.88) {
        commitTransition(true);
        ticking = false;
        return;
      }
      if (Math.abs(introZoomTarget - introZoom) > .0005) {
        requestAnimationFrame(paintIntro);
      } else {
        ticking = false;
      }
    };

    const requestPaint = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paintIntro);
      }
    };

    window.addEventListener('resize', requestPaint, {passive:true});
    const changeIntroZoom = delta => {
      const factor = Math.exp(delta * .00135);
      introZoomTarget = clamp(introZoomTarget * factor, .025, 2.94);
      requestPaint();
    };
    window.addEventListener('wheel', event => {
      if (!document.body.classList.contains('intro-active') || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      changeIntroZoom(event.deltaY);
    }, {passive:false,capture:true});

    let introTouchY = null;
    stage.addEventListener('touchstart', event => {
      introTouchY = event.touches[0]?.clientY ?? null;
    }, {passive:true});
    stage.addEventListener('touchmove', event => {
      if (introTouchY === null) return;
      const nextY = event.touches[0]?.clientY;
      if (nextY === undefined) return;
      event.preventDefault();
      changeIntroZoom((introTouchY - nextY) * 2.1);
      introTouchY = nextY;
    }, {passive:false});
    stage.addEventListener('touchend', () => { introTouchY = null; }, {passive:true});

    skip.addEventListener('click', () => commitTransition(true));

    const returnToIntro = document.querySelector('footer.contact .foot-note');
    if (returnToIntro) {
      returnToIntro.dataset.returnIntro = '';
      returnToIntro.setAttribute('role', 'button');
      returnToIntro.setAttribute('tabindex', '0');
      returnToIntro.setAttribute('aria-label', 'Вернуться на стартовый экран');
      const restartIntro = () => {
        transitionCommitted = false;
        introZoom = .82;
        introZoomTarget = .82;
        scene.getAnimations().forEach(animation => animation.cancel());
        flash.getAnimations().forEach(animation => animation.cancel());
        introShell.style.display = '';
        stage.style.opacity = '1';
        stage.style.filter = 'none';
        flash.style.opacity = '0';
        scene.style.transform = 'translate3d(0,0,0) scale(.82)';
        document.body.classList.remove('contact-revealed', 'header-visible', 'portal-committing');
        document.body.classList.add('has-crt-intro', 'intro-active');
        window.scrollTo(0, 0);
        drawMiniToScreen();
        requestPaint();
      };
      returnToIntro.addEventListener('click', restartIntro);
      returnToIntro.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        restartIntro();
      });
    }
    paintIntro();
  }

  const revealTargets = [
    ...document.querySelectorAll('.hero-profile-grid, section.chapter:not(#ch6), #ch6 .grit-about, #ch6 .grit-process, #ch6 .grit-work-section')
  ];

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach(element => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:.06, rootMargin:'0px 0px -9% 0px'});

    revealTargets.forEach(element => {
      element.classList.add('reveal-section');
      observer.observe(element);
    });
  }

  const precisePointer = window.matchMedia('(pointer:fine)').matches;
  if (!reduceMotion && precisePointer) {
    let targetY = window.scrollY;
    let currentY = window.scrollY;
    let frame = 0;
    let previousTime = performance.now();

    const animateScroll = time => {
      if (document.body.classList.contains('portal-committing')) {
        frame = 0;
        return;
      }
      const elapsed = Math.min(32, time - previousTime);
      previousTime = time;
      const response = 1 - Math.exp(-elapsed / 100);
      currentY += (targetY - currentY) * response;

      if (Math.abs(targetY - currentY) < .5) {
        currentY = targetY;
        window.scrollTo(0, currentY);
        frame = 0;
        return;
      }

      window.scrollTo(0, currentY);
      frame = requestAnimationFrame(animateScroll);
    };

    window.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;
      if (document.body.classList.contains('portal-committing')) {
        event.preventDefault();
        return;
      }
      const horizontalGallery = event.target.closest('.thumbs, [data-loop-gallery], .grit-gallery');
      if (horizontalGallery && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) return;

      event.preventDefault();
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      targetY = Math.max(0, Math.min(maxY, targetY + event.deltaY));
      currentY = window.scrollY;
      if (!frame) {
        previousTime = performance.now();
        frame = requestAnimationFrame(animateScroll);
      }
    }, {passive:false});

    window.addEventListener('scroll', () => {
      if (!frame) {
        targetY = window.scrollY;
        currentY = window.scrollY;
      }
    }, {passive:true});
  }

  document.querySelectorAll('#ch6 [data-grit-gallery]').forEach(viewport => {
    const rail = viewport.querySelector('.grit-gallery-rail');
    if (!rail) return;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    viewport.querySelectorAll('img').forEach(image => image.draggable = false);
    viewport.addEventListener('dragstart', event => event.preventDefault());
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = viewport.scrollLeft;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture?.(event.pointerId);
    });
    viewport.addEventListener('pointermove', event => {
      if (!dragging) return;
      const distance = event.clientX - startX;
      if (Math.abs(distance) > 3) moved = true;
      viewport.scrollLeft = startScroll - distance;
    });
    const endDrag = event => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-dragging');
      viewport.releasePointerCapture?.(event.pointerId);
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('click', event => {
      if (!moved) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    }, true);
  });

  if (precisePointer) {
    const cursor = document.createElement('div');
    cursor.className = 'elastic-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    const hand = document.createElement('img');
    hand.className = 'elastic-cursor-hand';
    hand.src = 'cursor-hand.png';
    hand.alt = '';
    hand.draggable = false;
    cursor.append(hand);
    document.body.append(cursor);
    document.body.classList.add('elastic-cursor-enabled');

    window.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      cursor.style.transform = `translate3d(${event.clientX - 25}px,${event.clientY - 7}px,0)`;
      cursor.classList.add('is-visible');
    }, {passive:true});

    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
    document.documentElement.addEventListener('mouseenter', () => cursor.classList.add('is-visible'));
  }
})();
