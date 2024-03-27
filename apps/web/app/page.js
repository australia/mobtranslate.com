'use client';

import styled from 'styled-components';

const Title = styled.div`
  font-size: 24px;
  font-weight: bold;
`;

const SubTitle = styled.div`
  font-size: 18px;
  font-weight: bold;
`;

const Byline = styled.div`
  font-size: 16px;
  font-weight: normal;
`;

export default function Page() {
  return (
    <div>
      <Title>Mob Translate</Title>
      <Byline>
        An opensource ecosystem to make Google Translate for indiginous
        languages
      </Byline>
      <SubTitle>Dictionaries</SubTitle>
    </div>
  );
}
