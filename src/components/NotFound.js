// components/NotFound.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

// Styled Components
const Container = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #1a1a1a;
  flex-direction: column;
  padding: 20px;
`;

const ErrorCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  padding: 30px;
  border-radius: 15px;
  text-align: center;
  backdrop-filter: blur(10px);
  max-width: 400px;
  width: 90%;
`;

const Title = styled.h1`
  color: #ffffff;
  font-size: 2.5rem;
  margin: 0 0 10px 0;
`;

const SubTitle = styled.div`
  color: #cccccc;
  font-size: 1.2rem;
  margin-bottom: 25px;
`;

const Button = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 12px 25px;
  border-radius: 8px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.2s;

  &:hover {
    background: #1976D2;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

function NotFound() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate('/viewer');
  };

  return (
    <Container>
      <ErrorCard>
        <Title>404</Title>
        <SubTitle>Page Not Found</SubTitle>
        <Button onClick={handleGoBack}>
          Go to AR Viewer
        </Button>
      </ErrorCard>
    </Container>
  );
}

export default NotFound;