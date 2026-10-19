import { ApiProperty } from '@nestjs/swagger';

export class AuthProvidersDto {
  @ApiProperty({
    description:
      'Google sign-in for buyers is set up (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)',
  })
  google!: boolean;
}
