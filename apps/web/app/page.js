'use client';

import Link from 'next/link';
import styled from 'styled-components';
import Head from 'next/head';

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

const Dictionary = styled.div`
  font-size: 16px;
  font-weight: normal;
`;

export default function Page() {
  return (
    <div>
      <Head>
        <title>Mob Translate - Aboriginal Google Translate</title>
        <meta
          name="description"
          content="Check out iPhone 12 XR Pro and iPhone 12 Pro Max. Visit your local store and for expert advice."
          key="desc"
        />
      </Head>
      <Title>Mob Translate</Title>
      <Byline>
        An opensource ecosystem to make Google Translate for indiginous
        languages
      </Byline>
      <SubTitle>Dictionaries</SubTitle>
      <Dictionary>
        <Link href="/dictionaries/kuku_yalanji">Kuku Yalanji</Link>
      </Dictionary>
    </div>
  );
}
