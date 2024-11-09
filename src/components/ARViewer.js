// components/ARViewer.js
import React, { useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ARViewer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const requestCameraPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      return true;
    } catch (err) {
      setError('Camera access is required to view AR content. Please allow camera access and refresh the page.');
      return false;
    }
  }, []);

  const loadARScripts = useCallback(async () => {
    try {
      await Promise.all([
        loadScript('https://aframe.io/releases/1.4.0/aframe.min.js'),
        loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js'),
        loadScript('https://raw.githack.com/fcor/arjs-gestures/master/dist/gestures.js')
      ]);
    } catch (error) {
      throw new Error('Failed to load AR libraries. Please check your internet connection.');
    }
  }, []);

  const loadScript = useCallback((url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }, []);

  const getExperienceData = useCallback(async (id) => {
    try {
      const docRef = doc(db, 'arExperiences', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('AR experience not found. Please check the URL and try again.');
      }

      return {
        ...docSnap.data(),
        id: docSnap.id
      };
    } catch (error) {
      throw new Error('Failed to load AR experience data. Please try again.');
    }
  }, []);

  const setupARScene = useCallback(async (arExperience) => {
    try {
      // Create AR Scene
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('gesture-detector', '');
      scene.setAttribute('arjs', `
        sourceType: webcam;
        debugUIEnabled: false;
        patternRatio: 0.75;
        detectionMode: mono_and_matrix;
        matrixCodeType: 3x3;
        sourceWidth: 1280;
        sourceHeight: 720;
        displayWidth: 1280;
        displayHeight: 720;
        maxDetectionRate: 60;
        canvasWidth: 1280;
        canvasHeight: 720;
      `);
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('renderer', 'antialias: true; alpha: true; precision: mediump;');

      // Create assets
      const assets = document.createElement('a-assets');
      const video = document.createElement('video');
      video.id = 'ar-video';
      video.src = arExperience.videoUrl;
      video.setAttribute('preload', 'auto');
      video.setAttribute('loop', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('crossorigin', 'anonymous');
      video.muted = true;
      assets.appendChild(video);
      scene.appendChild(assets);

      // Create marker
      const marker = document.createElement('a-marker');
      marker.setAttribute('preset', 'custom');
      marker.setAttribute('type', 'pattern');
      marker.setAttribute('url', arExperience.markerUrl);
      marker.setAttribute('smooth', 'true');
      marker.setAttribute('smoothCount', '5');
      marker.setAttribute('smoothTolerance', '0.01');
      marker.setAttribute('smoothThreshold', '2');
      marker.setAttribute('raycaster', 'objects: .clickable');
      marker.setAttribute('emitevents', 'true');

      // Create video entity
      const videoEntity = document.createElement('a-video');
      videoEntity.setAttribute('src', '#ar-video');
      videoEntity.setAttribute('scale', '1 1 1');
      videoEntity.setAttribute('position', '0 0 0');
      videoEntity.setAttribute('rotation', '-90 0 0');
      videoEntity.setAttribute('class', 'clickable');
      marker.appendChild(videoEntity);

      let markerVisible = false;
      marker.addEventListener('markerFound', () => {
        if (!markerVisible) {
          markerVisible = true;
          video.play().catch(console.error);
          video.muted = false;
          document.querySelector('.instructions')?.classList.add('hidden');
        }
      });

      marker.addEventListener('markerLost', () => {
        if (markerVisible) {
          markerVisible = false;
          video.muted = true;
          document.querySelector('.instructions')?.classList.remove('hidden');
        }
      });

      // Add camera
      const camera = document.createElement('a-entity');
      camera.setAttribute('camera', '');
      scene.appendChild(marker);
      scene.appendChild(camera);

      // Add scene to document
      document.body.appendChild(scene);

      // Enable video on interaction
      const enableVideo = () => {
        video.play().catch(console.error);
      };
      document.addEventListener('click', enableVideo, { once: true });
      document.addEventListener('touchstart', enableVideo, { once: true });

    } catch (error) {
      throw new Error('Failed to setup AR experience. Please refresh and try again.');
    }
  }, []);

  useEffect(() => {
    const initAR = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('id');

        if (!id) {
          navigate('/');
          return;
        }

        const hasCamera = await requestCameraPermission();
        if (!hasCamera) return;

        await loadARScripts();
        const arExperience = await getExperienceData(id);
        await setupARScene(arExperience);
        setLoading(false);
      } catch (error) {
        console.error('AR initialization error:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) scene.parentNode.removeChild(scene);
    };
  }, [loadARScripts, getExperienceData, setupARScene, requestCameraPermission, navigate]);

  if (!loading && error) {
    return (
      <ErrorContainer>
        <ErrorContent>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={() => window.location.reload()}>
            Try Again
          </RetryButton>
        </ErrorContent>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      {loading && <LoadingScreen>Loading AR Experience...</LoadingScreen>}
      <Instructions className="instructions">
        Point your camera at the marker image
      </Instructions>
    </Container>
  );
};

// Styled components
const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 25px;
  font-size: 16px;
  text-align: center;
  z-index: 2;
  width: 80%;
  max-width: 400px;
  transition: opacity 0.3s ease;
  
  &.hidden {
    opacity: 0;
    pointer-events: none;
  }
`;

const LoadingScreen = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  z-index: 999;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
`;

const ErrorContent = styled.div`
  background: rgba(255, 255, 255, 0.1);
  padding: 30px;
  border-radius: 10px;
  text-align: center;
  max-width: 400px;
  width: 100%;
`;

const ErrorText = styled.div`
  color: white;
  margin-bottom: 20px;
  line-height: 1.5;
`;

const RetryButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.3s ease;
  
  &:hover {
    background: #1976D2;
  }
`;

export default ARViewer;