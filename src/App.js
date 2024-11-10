import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              if (containerRef.current?.requestFullscreen) {
                await containerRef.current.requestFullscreen();
              } else if (containerRef.current?.webkitRequestFullscreen) {
                await containerRef.current.webkitRequestFullscreen();
              }
            } catch (err) {
              console.error('Error starting video:', err);
            }
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-screen h-screen bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      {/* Rectangle Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="border-8 border-red-500 rounded-lg"
          style={{
            width: '80vw',
            height: '60vh'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;