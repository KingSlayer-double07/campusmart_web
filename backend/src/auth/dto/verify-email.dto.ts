// TODO(resend): Disabled until Resend is set up — see src/mail/mail.service.ts.
//
// import { ApiProperty } from '@nestjs/swagger';
// import { Matches } from 'class-validator';
//
// export class VerifyEmailDto {
//   @ApiProperty({
//     description: '6-digit verification code sent to the user\'s email',
//     type: String,
//     example: '482913'
//   })
//   @Matches(/^\d{6}$/, { message: 'Verification code must be 6 digits' })
//   code!: string;
// }
