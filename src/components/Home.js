// components/Home.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

function Home() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');

  React.useEffect(() => {
    if (id) {
      navigate(`/view?id=${id}`);
    }
  }, [id, navigate]);

  return (
    <Container>
      <Content>
        <Title>AR Experience Viewer</Title>
        <InstructionsCard>
          <InstructionsTitle>How to View AR Content:</InstructionsTitle>
          <InstructionsList>
            <Instruction>1. Use the URL shared with you</Instruction>
            <Instruction>2. Allow camera access when prompted</Instruction>
            <Instruction>3. Point your camera at the marker image</Instruction>
            <Instruction>4. Keep the marker in view to see the AR content</Instruction>
          </InstructionsList>
          <Note>
            The URL should include an experience ID (e.g., /view?id=your_experience_id)
          </Note>
        </InstructionsCard>
      </Content>
    </Container>
  );
}

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
`;

const Content = styled.div`
  max-width: 600px;
  width: 100%;
`;

const Title = styled.h1`
  text-align: center;
  margin-bottom: 30px;
  font-size: 2.5rem;
  color: #fff;
`;

const InstructionsCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 30px;
  backdrop-filter: blur(10px);
`;

const InstructionsTitle = styled.h2`
  margin-bottom: 20px;
  color: #2196F3;
  font-size: 1.5rem;
`;

const InstructionsList = styled.div`
  margin-bottom: 20px;
`;

const Instruction = styled.p`
  margin: 15px 0;
  font-size: 1.1rem;
  line-height: 1.5;
  color: #fff;
`;

const Note = styled.p`
  font-size: 0.9rem;
  color: #888;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

export default Home;